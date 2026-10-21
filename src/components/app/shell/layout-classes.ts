/** Shared layout classes of the app shell (kept in one place so bars and content stay aligned). */

/** Horizontal page gutter: 16px phones, 24px tablets, 32px desktops – never under a notch (safe-area insets). */
export const GUTTER_X =
  "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] " +
  "sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-8";

/** Content column width. */
export const CONTENT_MAX_W = "mx-auto w-full max-w-[1440px]";
