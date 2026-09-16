/**
 * Shared presentational components (spec 7.1).
 *
 * Reusable, product-agnostic UI building blocks used across features. Design-
 * system primitives (buttons, inputs, dialogs, tables…) live in `./ui`. Keep
 * these components free of data-access and authorization logic — that belongs
 * in `src/features/*` and `src/lib/*`.
 */

export * from "./ui";
export { ThemeProvider } from "./theme-provider";
export { ThemeToggle } from "./theme-toggle";
