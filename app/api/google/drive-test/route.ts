
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { loadGoogleTokens } from "../../../../lib/google-token";

export const runtime = "nodejs";

export async function GET() {
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

  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";

    let cause = "unknown";

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? String(error.code)
        : "";

    const httpStatus =
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof error.response === "object" &&
      error.response !== null &&
      "status" in error.response
        ? Number(error.response.status)
        : null;

    const responseData =
      typeof error === "object" &&
      error !== null &&
      "response" in error
        ? (
            error as {
              response?: {
                data?: {
                  error?: {
                    errors?: Array<{ reason?: string }>;
                    status?: string;
                  };
                };
              };
            }
          ).response?.data
        : undefined;

    const googleReason =
      responseData?.error?.errors?.[0]?.reason ?? "unknown";

    const googleStatus =
      responseData?.error?.status ?? "unknown";



    if (message.includes("invalid_grant")) {
      cause = "google_reauthentication_required";
    } else if (
      message.includes("File not found") ||
      message.includes("notFound")
    ) {
      cause = "folder_not_found_or_no_permission";
    } else if (
      message.includes("insufficient") ||
      message.includes("permission")
    ) {
      cause = "google_permission_error";
    } else if (
      message.includes("Unsupported state") ||
      message.includes("authenticate data")
    ) {
      cause = "token_decryption_error";
    }

    return NextResponse.json(
      {
        success: false,
        error: "Google Drive 연결 확인에 실패했습니다.",
        cause,
        errorCode,
        httpStatus,
        googleReason,
        googleStatus,
      },
      { status: 500 }
    );
  }
}
