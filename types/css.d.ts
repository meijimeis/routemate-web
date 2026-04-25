/**
 * Type declarations for CSS imports
 * Allows TypeScript to recognize CSS side-effect imports across the application
 */

declare module '*.css' {
  const content: string;
  export default content;
}
