import { describe, expect, it } from "vitest";
import {
  azureDevOpsUrlLabel,
  flattenInlineRun,
  isInlineRun,
  rewriteAzureDevOpsPath,
  rewriteAzureDevOpsUrl,
  tidyMarkdown,
  tightenLinks,
  visibleLine,
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

describe("pipeline breadcrumbs with long URLs", () => {
  const scope = "https://dev.azure.com/inscriptrx/Org/_build?definitionScope=%5CBackend%5CTSGen";
  const summary = "https://dev.azure.com/inscriptrx/Org/_build?definitionId=165&_a=summary";
  const pasted = `[TSGen](${scope})\n\n/\n\n[Model.CQE.Landing.Org](${summary})`;

  it("flattens segments whose links are longer than the fragment guard", () => {
    expect(flattenInlineRun(pasted)).toBe(
      `[TSGen](${scope}) / [Model.CQE.Landing.Org](${summary})`,
    );
  });

  it("measures the visible text, not the markdown", () => {
    expect(visibleLine(`[TSGen](${scope})`)).toBe("TSGen");
    expect(visibleLine("see https://dev.azure.com/inscriptrx/Org/_build?x=1 now")).toBe(
      "see url now",
    );
  });

  it("still rejects prose whose sentences are long", () => {
    const prose = `The nightly build for [TSGen](${scope}) failed again last night.\n\nRetry it from the summary page.`;
    expect(isInlineRun(prose)).toBe(false);
  });
});

/* ------------------------------------------- bare Azure DevOps URLs pasted on their own */

const WIKI = "https://dev.azure.com/inscriptrx/Org/_wiki/wikis/ScriptWellRx.wiki/910/2026-04-20-dev-notes";
const GIT_FILE = "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum?path=/Model.Landing.Optum.sln";
const GIT_BRANCH =
  "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum?version=GBfeature/1403&path=/Model.Landing.Optum.sln";
const PULL_REQUEST = "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum/pullrequest/2865";

describe("Azure DevOps URL pasted as a bare URL", () => {
  it("labels a wiki page with its page name", () => {
    expect(rewriteAzureDevOpsUrl(WIKI)).toBe(`[2026-04-20-dev-notes](${WIKI})`);
  });

  it("labels a repo file with its filename", () => {
    expect(rewriteAzureDevOpsUrl(GIT_FILE)).toBe(`[Model.Landing.Optum.sln](${GIT_FILE})`);
  });

  it("labels a repo file on a branch with branch / filename", () => {
    expect(rewriteAzureDevOpsUrl(GIT_BRANCH)).toBe(
      `[feature/1403 / Model.Landing.Optum.sln](${GIT_BRANCH})`,
    );
  });

  it("labels a pull request with repo and number", () => {
    expect(rewriteAzureDevOpsUrl(PULL_REQUEST)).toBe(
      `[Model.Landing.Optum PR !2865](${PULL_REQUEST})`,
    );
  });

  it("decodes a branch name whose slash arrived percent-encoded", () => {
    const encoded =
      "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum?version=GBfeature%2F1403&path=%2FModel.Landing.Optum.sln";
    expect(azureDevOpsUrlLabel(encoded)).toBe("feature/1403 / Model.Landing.Optum.sln");
    // Raw and encoded forms of the same link produce the same label.
    expect(azureDevOpsUrlLabel(encoded)).toBe(azureDevOpsUrlLabel(GIT_BRANCH));
  });

  it("reads version and path in either order", () => {
    const swapped =
      "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum?path=/src/Deep/Nested.cs&version=GBmain";
    expect(azureDevOpsUrlLabel(swapped)).toBe("main / Nested.cs");
  });

  it("treats a pullrequest path segment as a pull request whatever the query says", () => {
    // Guard: the shapes cannot collide today, but the PR path must always win if they ever do.
    const hybrid = `${PULL_REQUEST}?path=/Model.Landing.Optum.sln&version=GBmain`;
    expect(azureDevOpsUrlLabel(hybrid)).toBe("Model.Landing.Optum PR !2865");
  });

  it("leaves tags, commits and other version prefixes alone", () => {
    const base = "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum?path=/a.sln";
    expect(azureDevOpsUrlLabel(`${base}&version=GTv1.2.0`)).toBeNull();
    expect(azureDevOpsUrlLabel(`${base}&version=GC0ff1ce`)).toBeNull();
  });

  it("falls through on any dev.azure.com URL that is not one of the four shapes", () => {
    expect(azureDevOpsUrlLabel("https://dev.azure.com/inscriptrx/Org")).toBeNull();
    expect(azureDevOpsUrlLabel("https://dev.azure.com/inscriptrx/Org/_workitems/edit/1403")).toBeNull();
    expect(azureDevOpsUrlLabel("https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum")).toBeNull();
    expect(azureDevOpsUrlLabel("https://dev.azure.com/inscriptrx/Org/_wiki/wikis/ScriptWellRx.wiki")).toBeNull();
    expect(rewriteAzureDevOpsUrl("https://dev.azure.com/inscriptrx/Org")).toBeNull();
  });

  it("ignores other hosts and URLs embedded in larger text", () => {
    expect(azureDevOpsUrlLabel("https://github.com/ClemL/md-notebook/pull/7")).toBeNull();
    expect(azureDevOpsUrlLabel(`see ${PULL_REQUEST} for the fix`)).toBeNull();
    expect(azureDevOpsUrlLabel(`${WIKI}\n${GIT_FILE}`)).toBeNull();
  });

  it("tolerates surrounding whitespace on an otherwise bare URL", () => {
    expect(rewriteAzureDevOpsUrl(`  ${PULL_REQUEST}\n`)).toBe(
      `[Model.Landing.Optum PR !2865](${PULL_REQUEST})`,
    );
  });
});
