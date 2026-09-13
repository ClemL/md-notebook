import { describe, expect, it } from "vitest";
import {
  flattenInlineRun,
  isInlineRun,
  rewriteAzureDevOpsPath,
  tidyMarkdown,
  tightenLinks,
} from "@/lib/richPaste";

/** Exactly what Turndown produces for an Azure DevOps breadcrumb copied from the browser. */
const ADO_BREADCRUMB = `/

[

Boards

](https://dev.azure.com/inscriptrx/Org/_workitems)

/

[

Sprints

](https://dev.azure.com/inscriptrx/Org/_sprints/directory)  `;

const ADO_EXPECTED =
  "/ [Boards](https://dev.azure.com/inscriptrx/Org/_workitems) / [Sprints](https://dev.azure.com/inscriptrx/Org/_sprints/directory)";

describe("breadcrumb paste", () => {
  it("collapses an Azure DevOps breadcrumb to one line of links", () => {
    expect(flattenInlineRun(tidyMarkdown(ADO_BREADCRUMB))).toBe(ADO_EXPECTED);
  });

  it("is idempotent once flattened", () => {
    expect(flattenInlineRun(ADO_EXPECTED)).toBe(ADO_EXPECTED);
  });

  it("handles > and | separators and a trailing segment without a link", () => {
    const md = "[Home](https://x.test/)\n\n\\>\n\n[Docs](https://x.test/docs)\n\n\\>\n\nPage";
    expect(flattenInlineRun(md)).toBe(
      "[Home](https://x.test/) \\> [Docs](https://x.test/docs) \\> Page",
    );
  });
});

describe("tightenLinks", () => {
  it("removes the whitespace Turndown leaves inside link syntax", () => {
    expect(tightenLinks("[\n\n Boards \n\n](https://x.test/a)")).toBe("[Boards](https://x.test/a)");
  });

  it("collapses a multi-word label onto one line", () => {
    expect(tightenLinks("[ Sprint\n board ]( https://x.test/b )")).toBe(
      "[Sprint board](https://x.test/b)",
    );
  });

  it("leaves an ordinary link alone", () => {
    expect(tightenLinks("see [docs](https://x.test/d) now")).toBe("see [docs](https://x.test/d) now");
  });

  it("does not touch bracketed text that is not a link", () => {
    expect(tightenLinks("an array [1, 2, 3] and (parentheses)")).toBe(
      "an array [1, 2, 3] and (parentheses)",
    );
  });
});

describe("isInlineRun guards", () => {
  it("rejects prose paragraphs that happen to contain a link", () => {
    const md =
      "The vendor feed lands at 2am and is loaded by the nightly job.\n\nSee [the runbook](https://x.test/r) for the retry steps and escalation path.";
    expect(isInlineRun(md)).toBe(false);
  });

  it("rejects anything with block structure", () => {
    expect(isInlineRun("## Heading\n\n[a](https://x.test/)\n\n[b](https://x.test/)")).toBe(false);
    expect(isInlineRun("- [a](https://x.test/)\n\n- [b](https://x.test/)")).toBe(false);
    expect(isInlineRun("| a | b |\n\n[c](https://x.test/)")).toBe(false);
  });

  it("rejects a run with no links at all", () => {
    expect(isInlineRun("alpha\n\nbeta\n\ngamma")).toBe(false);
  });

  it("rejects a single line, which needs no flattening", () => {
    expect(isInlineRun("[only](https://x.test/)")).toBe(false);
  });

  it("accepts a short trail of linked segments", () => {
    expect(isInlineRun(ADO_BREADCRUMB)).toBe(true);
  });
});

describe("Azure DevOps file paths", () => {
  const url =
    "https://dev.azure.com/inscriptrx/Org/_git/DataDownloader.SFTP?path=/Downloader/StorageAccount.cs&_a=contents&version=GBrelease/10.0.0";

  it("moves the link to the end and drops the project segment", () => {
    expect(rewriteAzureDevOpsPath(`[StorageAccount.cs](${url})Org > DataDownloader.SFTP`)).toBe(
      `DataDownloader.SFTP > [StorageAccount.cs](${url})`,
    );
  });

  it("keeps deeper folder segments in order", () => {
    expect(
      rewriteAzureDevOpsPath(`[StorageAccount.cs](${url})Org > DataDownloader.SFTP > Downloader`),
    ).toBe(`DataDownloader.SFTP > Downloader > [StorageAccount.cs](${url})`);
  });

  it("drops the account name and a repeat of the file name", () => {
    expect(
      rewriteAzureDevOpsPath(`[StorageAccount.cs](${url})inscriptrx > Org > StorageAccount.cs`),
    ).toBe(`[StorageAccount.cs](${url})`);
  });

  it("handles the legacy visualstudio.com host", () => {
    const legacy = "https://inscriptrx.visualstudio.com/Org/_git/DataDownloader.SFTP?path=/a.cs";
    expect(rewriteAzureDevOpsPath(`[a.cs](${legacy})Org > DataDownloader.SFTP`)).toBe(
      `DataDownloader.SFTP > [a.cs](${legacy})`,
    );
  });

  it("leaves non-Azure links, plain text and multi-link lines alone", () => {
    const github = "[README.md](https://github.com/ClemL/md-notebook)ClemL > md-notebook";
    expect(rewriteAzureDevOpsPath(github)).toBe(github);
    expect(rewriteAzureDevOpsPath("just some text")).toBe("just some text");
    const two = `[a](${url})Org > [b](${url})`;
    expect(rewriteAzureDevOpsPath(two)).toBe(two);
  });

  it("leaves a bare Azure link with no trail alone", () => {
    expect(rewriteAzureDevOpsPath(`[StorageAccount.cs](${url})`)).toBe(
      `[StorageAccount.cs](${url})`,
    );
  });
});
