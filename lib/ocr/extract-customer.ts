
export type ExtractedCustomer = {
  name: string;
  phone: string;
  carrier: string;
  device: string;
  plan: string;
  openDate: string;
  endDate: string;
  needsReview: string[];
};

export function extractCustomer(
  ocrText: string
): ExtractedCustomer {
  // OCR에서 발생할 수 있는 공백 차이를 정리합니다.
  const text = ocrText
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // 항목명 뒤에 적힌 값을 찾습니다.
  function findField(labels: string[]): string {
    for (const line of lines) {
      for (const label of labels) {
        const escaped = label.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        const regex = new RegExp(
          `^${escaped}\\s*[:：]?\\s*(.+)$`,
          "i"
        );

        const match = line.match(regex);

        if (match) {
          const value = match[1].trim();

          // 다른 항목명이 바로 이어지면 추측하지 않습니다.
          if (value && value.length <= 60) {
            return value;
          }
        }
      }
    }

    return "";
  }

  // 고객명: 명시적인 항목명에서만 추출
  const rawName = findField([
    "고객명",
    "가입자명",
    "신청인명",
    "성명",
  ]);

  const name = /^[가-힣]{2,5}$/.test(rawName)
    ? rawName
    : "";

  // 휴대폰 번호: 010으로 시작하는 번호만 추출
  const phoneMatches = [
    ...text.matchAll(
      /(?<!\d)010[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g
    ),
  ];

  const uniquePhones = [
    ...new Set(
      phoneMatches.map((match) =>
        match[0].replace(/\D/g, "")
      )
    ),
  ];

  // 여러 번호가 발견되면 임의로 선택하지 않습니다.
  const phone =
    uniquePhones.length === 1
      ? uniquePhones[0].replace(
          /^(010)(\d{4})(\d{4})$/,
          "$1-$2-$3"
        )
      : "";

  // 통신사: 항목명이 명확한 경우만 추출
  const rawCarrier = findField([
    "가입통신사",
    "통신사",
    "이동통신사",
  ]);

  let carrier = "";

  if (/^(KT|케이티)$/i.test(rawCarrier)) {
    carrier = "KT";
  } else if (/^(SKT|SK텔레콤)$/i.test(rawCarrier)) {
    carrier = "SKT";
  } else if (/^(LGU\+|LG U\+|엘지유플러스)$/i.test(rawCarrier)) {
    carrier = "LG U+";
  }

  const device = findField([
    "단말기명",
    "모델명",
    "기기명",
    "단말기",
  ]);

  const plan = findField([
    "요금제명",
    "가입요금제",
    "요금제",
  ]);

  // 날짜를 YYYY-MM-DD 형식으로 정리
  function normalizeDate(value: string): string {
    const match = value.match(
      /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/
    );

    if (!match) return "";

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return "";
    }

    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  const openDate = normalizeDate(
    findField(["개통일자", "개통일"])
  );

  const endDate = normalizeDate(
    findField([
      "약정종료일",
      "약정만료일",
      "약정 종료일",
    ])
  );

  // 추출하지 못한 항목은 확인 필요로 표시
  const needsReview: string[] = [];

  const fields = {
    고객명: name,
    휴대폰번호: phone,
    통신사: carrier,
    기기명: device,
    요금제: plan,
    개통일: openDate,
    약정종료일: endDate,
  };

  for (const [label, value] of Object.entries(fields)) {
    if (!value) {
      needsReview.push(label);
    }
  }

  return {
    name,
    phone,
    carrier,
    device,
    plan,
    openDate,
    endDate,
    needsReview,
  };
}
