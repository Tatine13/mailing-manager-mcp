import { createRequire } from 'node:module';
import path from 'path';
import fs from 'fs';
import { ProviderPreset } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

let customPresetsPath: string | null = null;
const presets: Map<string, ProviderPreset> = new Map();

/**
 * Initialize presets by loading defaults and merging with custom ones from dataDir.
 */
export async function initPresets(dataDir: string): Promise<void> {
  customPresetsPath = path.join(dataDir, 'providers.json');
  
  // 1. Load Defaults
  try {
    const defaults = require('../../config/providers.json');
    for (const [key, value] of Object.entries(defaults)) {
      presets.set(key, value as ProviderPreset);
    }
  } catch (err) {
    getLogger().warn('Default providers config not found');
  }

  // 2. Load Customs
  if (fs.existsSync(customPresetsPath)) {
    try {
      const data = fs.readFileSync(customPresetsPath, 'utf-8');
      const customs = JSON.parse(data);
      for (const [key, value] of Object.entries(customs)) {
        presets.set(key, value as ProviderPreset);
      }
      getLogger().info({ count: Object.keys(customs).length }, 'Custom provider presets loaded');
    } catch (err) {
      getLogger().error({ err }, 'Failed to load custom provider presets');
    }
  }
}

export function getProviderPreset(provider: string): ProviderPreset | undefined {
  return presets.get(provider);
}

export function getAllProviderPresets(): ProviderPreset[] {
  return Array.from(presets.values());
}

export function getProviderNames(): string[] {
  return Array.from(presets.keys());
}

/**
 * Add or update a provider preset and persist it.
 */
export async function addProviderPreset(preset: ProviderPreset): Promise<void> {
  presets.set(preset.provider, preset);
  
  if (customPresetsPath) {
    try {
      const customs: Record<string, ProviderPreset> = {};
      // We only persist what's NOT in the defaults, or we persist everything to be safe?
      // Better to persist everything added/modified.
      // Filter out defaults to keep the custom file small? 
      // No, let's just save all current presets to the custom file, it's easier.
      
      const allPresets = Object.fromEntries(presets);
      fs.writeFileSync(customPresetsPath, JSON.stringify(allPresets, null, 2));
      getLogger().info({ provider: preset.provider }, 'Provider preset saved');
    } catch (err) {
      throw new Error(`Failed to save provider preset: ${(err as Error).message}`);
    }
  }
}

