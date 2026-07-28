/**
 * Provider logos from https://svgl.app (pheralb/svgl).
 * Bundled locally for offline use in Electron.
 */
import openaiLight from '../assets/provider-logos/openai-light.svg'
import openaiDark from '../assets/provider-logos/openai-dark.svg'
import anthropicLight from '../assets/provider-logos/anthropic-light.svg'
import anthropicDark from '../assets/provider-logos/anthropic-dark.svg'
import google from '../assets/provider-logos/google.svg'
import meta from '../assets/provider-logos/meta.svg'
import deepseek from '../assets/provider-logos/deepseek.svg'
import mistral from '../assets/provider-logos/mistral.svg'
import qwenLight from '../assets/provider-logos/qwen-light.svg'
import qwenDark from '../assets/provider-logos/qwen-dark.svg'
import microsoft from '../assets/provider-logos/microsoft.svg'
import xaiLight from '../assets/provider-logos/xai-light.svg'
import xaiDark from '../assets/provider-logos/xai-dark.svg'
import cohere from '../assets/provider-logos/cohere.svg'
import perplexity from '../assets/provider-logos/perplexity.svg'
import kimi from '../assets/provider-logos/kimi.svg'
import nvidiaLight from '../assets/provider-logos/nvidia-light.svg'
import nvidiaDark from '../assets/provider-logos/nvidia-dark.svg'
import openrouterLight from '../assets/provider-logos/openrouter-light.svg'
import openrouterDark from '../assets/provider-logos/openrouter-dark.svg'
import awsLight from '../assets/provider-logos/aws-light.svg'
import awsDark from '../assets/provider-logos/aws-dark.svg'

export type ThemeMode = 'light' | 'dark'
export type LogoAsset = string | { light: string; dark: string }

export function resolveLogoSrc(asset: LogoAsset, theme: ThemeMode): string {
  if (typeof asset === 'string') return asset
  return theme === 'dark' ? asset.dark : asset.light
}

/** OpenRouter vendor slug -> SVGL asset(s). */
export const PROVIDER_LOGO_MAP: Record<string, LogoAsset> = {
  openai: { light: openaiLight, dark: openaiDark },
  anthropic: { light: anthropicLight, dark: anthropicDark },
  google: google,
  'meta-llama': meta,
  deepseek: deepseek,
  mistralai: mistral,
  qwen: { light: qwenLight, dark: qwenDark },
  microsoft: microsoft,
  'x-ai': { light: xaiLight, dark: xaiDark },
  cohere: cohere,
  perplexity: perplexity,
  moonshotai: kimi,
  nvidia: { light: nvidiaLight, dark: nvidiaDark },
  openrouter: { light: openrouterLight, dark: openrouterDark },
  amazon: { light: awsLight, dark: awsDark }
}
