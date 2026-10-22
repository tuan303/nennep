"use client";
import { useMemo } from "react";
import { canSeeRoute, routeForPath } from "@/components/app/shell/routes";
import { useSession } from "@/lib/client/session";
import { sectionForRole } from "./guide-meta";
import type { GuideRole, GuideSection } from "./types";

export interface GuideViewer {
  /**
   * "signedIn": profile loaded · "restoring": a Firebase account is being checked (treat as signed in for the
   * "Vào phần mềm" button) · "unknown": session not restored yet · "signedOut": no account or no permission.
   */
  state: "signedIn" | "restoring" | "unknown" | "signedOut";
  role?: GuideRole;
  /** Href of the screen a section describes when the reader may open it, else undefined. */
  screenHref: (section: Pick<GuideSection, "route" | "roles">) => string | undefined;
}

/** Who is reading the public guide (it renders for everyone; the session only adds shortcuts). */
export function useGuideViewer(): GuideViewer {
  const { status, email, profile, can, accessibleLevels } = useSession();
  const levelCount = accessibleLevels.length;
  return useMemo(() => {
    const state: GuideViewer["state"] =
      status === "signedIn" ? "signedIn" : status === "loading" ? (email ? "restoring" : "unknown") : "signedOut";
    const role = status === "signedIn" ? profile?.role : undefined;
    const screenHref = (section: Pick<GuideSection, "route" | "roles">) => {
      if (state !== "signedIn" || !section.route) return undefined;
      // Only screens of the signed-in app (public pages such as /dang-nhap need no shortcut), and only when this
      // reader may open them (route permission, else the section's roles).
      const route = routeForPath(section.route.split(/[?#]/)[0] || "/");
      if (!route) return undefined;
      return canSeeRoute(route, { can, levelCount }) && sectionForRole(section, role) ? section.route : undefined;
    };
    return { state, role, screenHref };
  }, [status, email, profile, can, levelCount]);
}
