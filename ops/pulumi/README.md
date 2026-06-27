# Pulumi deploy — Oracle Cloud Always Free

Deploys webhook-gateway onto an Oracle Cloud **Ampere A1.Flex** ARM VM (4 OCPUs / 24 GB RAM, forever free). Cost: **$0/month** within Always-Free limits.

The VM joins your tailnet and serves both ingress and admin UI through Tailscale. For public webhook senders (Stripe, GitHub, etc.) to reach the gateway, set up a Cloudflare Tunnel (free) from the VM to a domain you control — it terminates TLS and forwards to `localhost:5001`. The security list does NOT open 5001 to the public internet.

## One-time setup

1. **Oracle Cloud account** at https://cloud.oracle.com. Use a region with A1.Flex capacity.
2. **Pulumi CLI** — `brew install pulumi/tap/pulumi`
3. **OCI API key** — Console → Identity → Users → API Keys → Add Public Key.
4. **Tailscale auth key** — https://login.tailscale.com/admin/settings/keys (ephemeral + reusable + tag `gateway`).

## Configure + deploy

```bash
cd ops/pulumi
pnpm install
pulumi stack init dev

pulumi config set tenancyOcid       ocid1.tenancy.oc1..xxxxx
pulumi config set userOcid          ocid1.user.oc1..xxxxx
pulumi config set compartmentOcid   ocid1.tenancy.oc1..xxxxx
pulumi config set region            eu-frankfurt-1
pulumi config set availabilityDomain "tQjF:EU-FRANKFURT-1-AD-1"
pulumi config set sshAuthorizedKey  "$(cat ~/.ssh/id_ed25519.pub)"
pulumi config set repoUrl           "https://github.com/mateokadiu/webhook-gateway.git"
pulumi config set plugins           "@webhook-gateway/plugin-stripe,@webhook-gateway/plugin-github"

pulumi config set --secret tailscaleAuthKey "tskey-auth-xxxxx"
pulumi config set --secret adminBearer      "$(openssl rand -hex 32)"

pulumi up
```

cloud-init takes 3-5 minutes after `pulumi up` to install Docker + boot the stack. Watch:

```bash
SSH=$(pulumi stack output sshCommand)
$SSH "tail -f /var/log/cloud-init-output.log"
```

When you see `Reached target Multi-User System`, hit the admin UI from your laptop (Tailscale running):

```
https://gateway.<your-tailnet>.ts.net:5000
```

## Wiring public ingress

The VM has a public IP but **5001 isn't open in the security list**. For Stripe/GitHub to reach `/in/:source`, set up a Cloudflare Tunnel on the VM:

```bash
SSH=$(pulumi stack output sshCommand)
$SSH "curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
$SSH "cloudflared tunnel login"
$SSH "cloudflared tunnel create webhook-gateway"
# then point a CF DNS record to the tunnel and route http://localhost:5001 → public domain
```

Now Stripe POSTs to `https://hooks.<your-domain>/in/stripe-prod` → Cloudflare → tunnel → VM `:5001/in/...`.

## Cost guardrails

- **Always-Free shape budget**: 4 OCPUs + 24 GB RAM across all A1.Flex. This program uses the full budget in one VM.
- **Outbound bandwidth**: 10 TB/month free per region. Webhook traffic doesn't approach this.
- **Block storage**: 200 GB free across all volumes. Boot disk is 50 GB.

## Tear down

```bash
pulumi destroy
```
