declare module '*.css'
declare module '*?raw' {
  const source: string
  export default source
}
declare module '*?worker' {
  const WorkerConstructor: new () => Worker
  export default WorkerConstructor
}
declare module 'pako'
