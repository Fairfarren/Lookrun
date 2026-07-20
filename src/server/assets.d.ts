// 静态资源以 Bun 的 file 类型导入，编译时内嵌进可执行文件
declare module '*.png' {
  const filePath: string;
  export default filePath;
}
