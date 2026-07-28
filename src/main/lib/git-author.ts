export interface GitAuthorIdentity {
  name: string
  email: string
}

export function gitAuthorEnv(author: GitAuthorIdentity): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email
  }
}
