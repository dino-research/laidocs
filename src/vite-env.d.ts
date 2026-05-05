/// <reference types="vite/client" />

// Declare CSS module imports so TypeScript doesn't complain about
// bare CSS imports like `import "bytemd/dist/index.css"`
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
