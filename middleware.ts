import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type CookiesToSet = Array<{ name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }>;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next");

  /** Ver la UI sin Supabase/sesión (solo desarrollo; no uses en producción). */
  const demoPreview =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
  if (demoPreview && !isPublic) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const hasSupabase = Boolean(url && anon);

  if (!hasSupabase) {
    if (!isPublic) {
      const u = request.nextUrl.clone();
      u.pathname = "/login";
      u.searchParams.set("setup", "supabase");
      return NextResponse.redirect(u);
    }
    return response;
  }

  const supabase = createServerClient(url!, anon!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Refresh session if expired.
  await supabase.auth.getUser();

  if (isPublic) return response;

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

