
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { saveGoogleTokens } from "../../../../../lib/google-token";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const savedState = request.cookies.get("google_oauth_state")?.value;

  const validState =
    !!state &&
    !!savedState &&
    state.length === savedState.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(savedState));

  if (!validState) {
    return NextResponse.json(
      { error: "Google 인증 확인값이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  if (error || !code) {
    return NextResponse.json(
      { error: "Google 로그인이 취소되었거나 실패했습니다." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Google 인증 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        cache: "no-store",
      }
    );

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: "Google 인증 토큰 발급에 실패했습니다." },
        { status: 400 }
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      throw new Error("Google 액세스 토큰이 없습니다.");
    }

    await saveGoogleTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
      scope: tokens.scope,
      token_type: tokens.token_type,
    });

    const response = NextResponse.redirect(
      new URL("/?google=connected", request.url)
    );

    response.cookies.delete("google_oauth_state");
    return response;
  } catch (error) {
    console.error("Google 인증 저장 오류:", error);

    return NextResponse.json(
      { error: "Google 인증정보 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
