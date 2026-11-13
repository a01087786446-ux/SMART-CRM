
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { loadGoogleTokens } from "../../../../../lib/google-token";

export const runtime = "nodejs";

export async function GET() {
  // 개발 중 임시 테스트용 API입니다.
  // 외부에 배포하기 전 반드시 관리자 인증을 추가해야 합니다.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "개발 환경에서만 사용할 수 있습니다." },
      { status: 403 }
    );
  }

  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
      return NextResponse.json(
        { error: "Google Drive 폴더 ID가 없습니다." },
        { status: 500 }
      );
    }

    const tokens = await loadGoogleTokens();

    if (!tokens?.refresh_token) {
      return NextResponse.json(
        { error: "Google 계정을 다시 연결해 주세요." },
        { status: 401 }
      );
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const folder = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
    });

    if (
      folder.data.mimeType !==
      "application/vnd.google-apps.folder"
    ) {
      return NextResponse.json(
        { error: "지정한 ID가 폴더가 아닙니다." },
        { status: 400 }
      );
    }

    const files = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: 20,
    });

    return NextResponse.json({
      success: true,
      message: "Google Drive 폴더 연결 성공",
      folderName: folder.data.name,
      fileCount: files.data.files?.length ?? 0,
      hasMore: !!files.data.nextPageToken,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Google Drive 연결 확인에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}
