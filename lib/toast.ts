export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('toast', { detail: message }))
}
