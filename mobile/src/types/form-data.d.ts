// React Native's FormData takes a file on the phone as its address, type and
// name; the DOM types TypeScript ships don't know that overload.
interface FormData {
  append(name: string, value: { uri: string; name: string; type: string }): void;
}
