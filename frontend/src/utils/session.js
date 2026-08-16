const KEY = 'stream_user'

export function getSessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function setSessionUser(user) {
  sessionStorage.setItem(KEY, JSON.stringify(user))
}

export function clearSessionUser() {
  sessionStorage.removeItem(KEY)
}
