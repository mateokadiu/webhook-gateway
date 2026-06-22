import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SignatureVerifier } from '@webhook-gateway/plugin-sdk';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly log = new Logger(PluginRegistryService.name);
  private readonly registry = new Map<string, SignatureVerifier>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    const csv = this.config.get('WEBHOOK_GATEWAY_PLUGINS', { infer: true });
    const packages = csv.split(',').map((s) => s.trim()).filter(Boolean);
    for (const pkg of packages) {
      try {
        const mod = (await import(pkg)) as Record<string, unknown>;
        const verifier = pickVerifier(mod);
        if (!verifier) {
          this.log.error({ pkg }, 'plugin export missing — expected default export or named SignatureVerifier');
          continue;
        }
        if (this.registry.has(verifier.id)) {
          this.log.error({ pkg, id: verifier.id }, 'duplicate plugin id — keeping first');
          continue;
        }
        this.registry.set(verifier.id, verifier);
        this.log.log({ pkg, id: verifier.id }, 'plugin loaded');
      } catch (err) {
        this.log.error({ pkg, err: errMsg(err) }, 'plugin load failed');
      }
    }
    this.log.log({ loaded: [...this.registry.keys()] }, `plugins ready (${this.registry.size})`);
  }

  get(id: string): SignatureVerifier | null {
    return this.registry.get(id) ?? null;
  }

  list(): { id: string }[] {
    return [...this.registry.keys()].map((id) => ({ id }));
  }
}

function pickVerifier(mod: Record<string, unknown>): SignatureVerifier | null {
  const candidate =
    (mod['default'] as SignatureVerifier | undefined) ??
    (Object.values(mod).find(isVerifier) as SignatureVerifier | undefined) ??
    null;
  return candidate;
}

function isVerifier(v: unknown): v is SignatureVerifier {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof (v as { id: unknown }).id === 'string' &&
    'verify' in v &&
    typeof (v as { verify: unknown }).verify === 'function'
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
