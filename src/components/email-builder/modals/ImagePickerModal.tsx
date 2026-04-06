'use client'

// Re-export the shared MediaLibraryModal as ImagePickerModal for backwards compat
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'

interface ImagePickerModalProps {
  onSelect: (url: string) => void
  onClose: () => void
}

export function ImagePickerModal({ onSelect, onClose }: ImagePickerModalProps) {
  return <MediaLibraryModal onSelect={onSelect} onClose={onClose} />
}
