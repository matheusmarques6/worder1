// O import raiz de 'pdf-parse' v1 executa código de debug que tenta ler
// './test/data/05-versions-space.pdf' e quebra em produção. Por isso o
// código importa 'pdf-parse/lib/pdf-parse.js' — que @types/pdf-parse não
// declara. Esta declaração reusa os tipos do módulo raiz.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse'
  export default pdfParse
}
