/**
 * Nội dung "Hướng dẫn sử dụng phần mềm Nền nếp" (/huong-dan) – pure data read by the guide renderer.
 * Sections are listed in group order (batdau → xem → ghinhan → dieuhanh → quantri → quytac → hoidap).
 * Checked by src/components/guide/__tests__/content.test.ts (ids, links, routes, no personal data).
 */
import type { GuideContent } from "../types";
import { BATDAU_SECTIONS } from "./batdau";
import { DIEUHANH_SECTIONS } from "./dieuhanh";
import { GHINHAN_SECTIONS } from "./ghinhan";
import { FAQ, GLOSSARY, HOIDAP_SECTIONS } from "./hoidap";
import { INTRO, QUICK_STARTS, UPDATED } from "./intro";
import { QUANTRI_SECTIONS } from "./quantri";
import { QUYTAC_SECTIONS } from "./quytac";
import { XEM_SECTIONS } from "./xem";

export const GUIDE: GuideContent = {
  updated: UPDATED,
  intro: INTRO,
  quickStarts: QUICK_STARTS,
  sections: [
    ...BATDAU_SECTIONS,
    ...XEM_SECTIONS,
    ...GHINHAN_SECTIONS,
    ...DIEUHANH_SECTIONS,
    ...QUANTRI_SECTIONS,
    ...QUYTAC_SECTIONS,
    ...HOIDAP_SECTIONS,
  ],
  faq: FAQ,
  glossary: GLOSSARY,
};
