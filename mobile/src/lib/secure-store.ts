// Native entry point for secure key/value storage.
//
// On web, metro resolves `secure-store.web.ts` instead — expo-secure-store has
// no web implementation and throws ("getValueWithKeyAsync is not a function").
export { getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";
