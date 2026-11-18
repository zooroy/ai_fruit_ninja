// E2E 在瀏覽器端讀寫的全域變數型別。執行時不輸出任何程式碼。
import type { TestHooks } from "../../src/main";

declare global {
  interface Window {
    __test: TestHooks;
    __cameraCalls: number;
    __xss?: unknown;
  }
}
