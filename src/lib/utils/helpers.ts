export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key])
    if (!result[groupKey]) {
      result[groupKey] = []
    }
    result[groupKey].push(item)
    return result
  }, {} as Record<string, T[]>)
}

export function sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    if (a[key] < b[key]) return order === 'asc' ? -1 : 1
    if (a[key] > b[key]) return order === 'asc' ? 1 : -1
    return 0
  })
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    active: 'success',
    live: 'success',
    paid: 'success',
    fulfilled: 'success',
    delivered: 'success',
    read: 'success',
    approved: 'success',
    sent: 'accent',
    sending: 'accent',
    open: 'accent',
    pending: 'warning',
    scheduled: 'warning',
    partial: 'warning',
    draft: 'warning',
    paused: 'warning',
    disconnected: 'error',
    failed: 'error',
    refunded: 'error',
    rejected: 'error',
    cancelled: 'error',
    voided: 'error',
    closed: 'dark',
    unfulfilled: 'dark',
  }
  return statusColors[status.toLowerCase()] || 'dark'
}
