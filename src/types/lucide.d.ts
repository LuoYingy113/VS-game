// Fix lucide-react-native missing `color` prop in TypeScript definitions
// export {} makes this a module so `declare module` augments instead of replaces
export {};
declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string;
  }
}
