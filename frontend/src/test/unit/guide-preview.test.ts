import { describe, expect, it } from "vitest";
import { extractGuidePreview } from "@/lib/guide-preview";

describe("guide preview extraction", () => {
  it("keeps ratio values containing full-width colons intact", () => {
    const preview = extractGuidePreview({
      structured: {},
      sections: [
        {
          title: "基本情况",
          text: [
            "本科生人数 | 4,480人 | 研究生人数 | 4,085人 | 师生比例 | 1：6",
            "合计：USD78,809",
          ].join("\n"),
        },
      ],
    });

    expect(preview.studentFacultyRatio).toBe("1：6");
    expect(preview.hasData).toBe(true);
  });
});
