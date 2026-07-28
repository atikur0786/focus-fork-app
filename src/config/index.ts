type EnvValue = string | undefined

interface AppEnv {
  VITE_BACKEND_URL: EnvValue
  VITE_GITHUB_CLIENT_ID: EnvValue
  VITE_APP_VERSION: EnvValue
}

export interface AppConfig {
  backendUrl: string
  githubClientId: string
  appVersion: string
}

const env = import.meta.env as ImportMetaEnv & AppEnv

const normalize = (value: EnvValue): string => value?.trim() ?? ''

export const config: AppConfig = {
  backendUrl: normalize(env.VITE_BACKEND_URL),
  githubClientId: normalize(env.VITE_GITHUB_CLIENT_ID),
  appVersion: normalize(env.VITE_APP_VERSION)
}

export const hasRequiredConfig = (): boolean => {
  return Boolean(config.backendUrl && config.githubClientId && config.appVersion)
}

