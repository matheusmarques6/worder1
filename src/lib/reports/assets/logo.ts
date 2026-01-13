/**
 * Logo Worder em Base64
 * 
 * ⚠️ IMPORTANTE: Substituir pelo logo real do Worder!
 * 
 * Para converter o logo real:
 * 1. Acesse: https://www.base64-image.de/ ou similar
 * 2. Faça upload do logo PNG (preferencialmente 240x80px)
 * 3. Copie o resultado e substitua abaixo
 * 
 * Ou via código:
 * ```
 * const fs = require('fs');
 * const logo = fs.readFileSync('./public/logo.png');
 * console.log(`data:image/png;base64,${logo.toString('base64')}`);
 * ```
 */

// Logo placeholder (texto "WORDER" estilizado em SVG -> base64)
// Tamanho: 240x80px
export const WORDER_LOGO_BASE64 = `data:image/svg+xml;base64,${Buffer.from(`
<svg width="240" height="80" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="240" height="80" fill="#ffffff"/>
  <rect x="0" y="60" width="240" height="4" fill="#f97316"/>
  <text x="120" y="45" 
        font-family="Arial, sans-serif" 
        font-size="36" 
        font-weight="bold" 
        fill="#1f2937" 
        text-anchor="middle">
    WORDER
  </text>
  <text x="120" y="58" 
        font-family="Arial, sans-serif" 
        font-size="10" 
        fill="#6b7280" 
        text-anchor="middle">
    CRM
  </text>
</svg>
`.trim()).toString('base64')}`

// Alternativa: Logo em PNG base64 (descomentar e usar quando tiver o real)
// export const WORDER_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgo...'

/**
 * Dimensões recomendadas para o logo:
 * - Largura: 120-240px
 * - Altura: 40-80px
 * - Formato: PNG com fundo transparente ou branco
 * - Resolução: 2x para melhor qualidade no PDF
 */
