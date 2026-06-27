import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';

const cfg = new pulumi.Config();
const compartmentOcid = cfg.require('compartmentOcid');
const region = cfg.get('region') ?? 'eu-frankfurt-1';
const availabilityDomain = cfg.require('availabilityDomain');
const sshAuthorizedKey = cfg.require('sshAuthorizedKey');
const tailscaleAuthKey = cfg.requireSecret('tailscaleAuthKey');
const repoUrl = cfg.require('repoUrl');
const adminBearer = cfg.requireSecret('adminBearer');
const plugins = cfg.get('plugins') ?? '@webhook-gateway/plugin-hmac';

const ubuntuImage = oci.core.getImagesOutput({
  compartmentId: compartmentOcid,
  operatingSystem: 'Canonical Ubuntu',
  operatingSystemVersion: '22.04',
  shape: 'VM.Standard.A1.Flex',
  sortBy: 'TIMECREATED',
  sortOrder: 'DESC',
}).images.apply((imgs) => {
  if (imgs.length === 0) throw new Error('no Ubuntu 22.04 ARM image found');
  return imgs[0]!.id;
});

// ── Networking ────────────────────────────────────────────────────────────
const vcn = new oci.core.Vcn('gateway-vcn', {
  compartmentId: compartmentOcid,
  cidrBlocks: ['10.0.0.0/16'],
  displayName: 'gateway-vcn',
  dnsLabel: 'gateway',
});

const igw = new oci.core.InternetGateway('gateway-igw', {
  compartmentId: compartmentOcid,
  vcnId: vcn.id,
  enabled: true,
});

const rt = new oci.core.RouteTable('gateway-rt', {
  compartmentId: compartmentOcid,
  vcnId: vcn.id,
  routeRules: [{ destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', networkEntityId: igw.id }],
});

// Inbound: SSH + Tailscale UDP. Webhook ingress + admin UI are reached via
// the tailnet or a Cloudflare Tunnel set up out-of-band — we do not open
// 5000/5001 to the public internet from the security list.
const sl = new oci.core.SecurityList('gateway-sl', {
  compartmentId: compartmentOcid,
  vcnId: vcn.id,
  egressSecurityRules: [{ destination: '0.0.0.0/0', protocol: 'all' }],
  ingressSecurityRules: [
    { protocol: '6', source: '0.0.0.0/0', tcpOptions: { min: 22, max: 22 } },
    { protocol: '17', source: '0.0.0.0/0', udpOptions: { min: 41641, max: 41641 } },
  ],
});

const subnet = new oci.core.Subnet('gateway-subnet', {
  compartmentId: compartmentOcid,
  vcnId: vcn.id,
  cidrBlock: '10.0.1.0/24',
  routeTableId: rt.id,
  securityListIds: [sl.id],
  prohibitPublicIpOnVnic: false,
});

// ── cloud-init ────────────────────────────────────────────────────────────
const userData = pulumi.all([tailscaleAuthKey, adminBearer]).apply(([tsKey, bearer]) =>
  Buffer.from(
    [
      '#cloud-config',
      'package_update: true',
      'package_upgrade: true',
      'packages:',
      '  - git',
      '  - curl',
      '  - ca-certificates',
      '  - gnupg',
      'runcmd:',
      '  # ── Tailscale ─────────────────────────────────────────────────',
      '  - curl -fsSL https://tailscale.com/install.sh | sh',
      `  - tailscale up --auth-key=${tsKey} --hostname=gateway --ssh`,
      '  # ── Docker ────────────────────────────────────────────────────',
      '  - install -m 0755 -d /etc/apt/keyrings',
      '  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
      '  - chmod a+r /etc/apt/keyrings/docker.gpg',
      '  - echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" > /etc/apt/sources.list.d/docker.list',
      '  - apt-get update -y',
      '  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      '  - systemctl enable --now docker',
      '  # ── App ───────────────────────────────────────────────────────',
      '  - mkdir -p /opt/gateway',
      `  - git clone ${repoUrl} /opt/gateway`,
      '  - cd /opt/gateway && cp .env.example .env',
      `  - sed -i "s|ADMIN_BEARER=.*|ADMIN_BEARER=${bearer}|" /opt/gateway/.env`,
      `  - sed -i "s|WEBHOOK_GATEWAY_PLUGINS=.*|WEBHOOK_GATEWAY_PLUGINS=${plugins}|" /opt/gateway/.env`,
      '  - cd /opt/gateway && docker compose --env-file .env up -d --build',
      '  - cd /opt/gateway && sleep 30 && docker compose --env-file .env exec -T api pnpm db:migrate || true',
      '  # ── Boot persistence ─────────────────────────────────────────',
      '  - |',
      '    cat > /etc/systemd/system/gateway.service <<UNIT',
      '    [Unit]',
      '    Description=webhook-gateway docker-compose stack',
      '    Requires=docker.service',
      '    After=docker.service network-online.target',
      '    [Service]',
      '    Type=oneshot',
      '    RemainAfterExit=yes',
      '    WorkingDirectory=/opt/gateway',
      '    ExecStart=/usr/bin/docker compose --env-file .env up -d',
      '    ExecStop=/usr/bin/docker compose --env-file .env down',
      '    [Install]',
      '    WantedBy=multi-user.target',
      '    UNIT',
      '  - systemctl daemon-reload',
      '  - systemctl enable gateway.service',
      '',
    ].join('\n'),
    'utf-8',
  ).toString('base64'),
);

// ── Compute (Always Free) ─────────────────────────────────────────────────
const instance = new oci.core.Instance('gateway-vm', {
  availabilityDomain,
  compartmentId: compartmentOcid,
  shape: 'VM.Standard.A1.Flex',
  shapeConfig: { ocpus: 4, memoryInGbs: 24 },
  sourceDetails: {
    sourceType: 'image',
    sourceId: ubuntuImage,
    bootVolumeSizeInGbs: '50',
  },
  createVnicDetails: {
    subnetId: subnet.id,
    assignPublicIp: 'true',
    hostnameLabel: 'gateway',
  },
  metadata: {
    ssh_authorized_keys: sshAuthorizedKey,
    user_data: userData,
  },
  displayName: 'gateway-vm',
});

export const publicIp = instance.publicIp;
export const sshCommand = pulumi.interpolate`ssh ubuntu@${instance.publicIp}`;
export const region_ = pulumi.output(region);
