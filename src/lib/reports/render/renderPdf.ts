import { renderToBuffer } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

/**
 * Gera um buffer de PDF a partir de um documento React-PDF
 */
export async function generatePdfBuffer(document: ReactElement): Promise<Buffer> {
  const buffer = await renderToBuffer(document)
  return buffer
}

/**
 * Converte buffer para Uint8Array (compatível com Response)
 */
export function bufferToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer)
}

/**
 * Gera PDF e retorna como Uint8Array pronto para Response
 */
export async function generatePdf(document: ReactElement): Promise<Uint8Array> {
  const buffer = await generatePdfBuffer(document)
  return bufferToUint8Array(buffer)
}
