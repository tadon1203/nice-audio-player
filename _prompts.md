!IMPORTANT: THIS IS THE FILE FOR INTERNAL PROMPTS. DO NOT REFER TO THIS FILE!

the dev workflow is like:
a nice model like gpt5.6 sol high on chatgpt web interface with entire codebase on its workspace generates super clear plan, cheap models luna mid or high impl it on codex.
"the web" is defined here as ChatGPT web inferface.
use `python scripts/create-project-snapshot.py` to provide the web the entire codebase. currently we use `Project` sources. use `git diff HEAD` or `git diff` to update the codebase on the web.
use the web, which is not included in codex usage, to save the codex usage (money as well).
set /goal and the below prompt for cheap models to prevent it from stop implementing even it's not complete.
"user" is defined here as the manual interop-er between codex and the web.
during long Codex implementation runs, user reports Codex logs to the web so progress can be monitored without interrupting the work.
after a plan implemented, user reports diff by above commands with the diff review prompt below. So this is kinda Plan->Impl->Review loop until Review reports no problem.
the review report may include comments by user like explaining UI/UX problem which is difficult to be found just reviewing code.
before report, the web must apply provided diff to its workspace.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

this prompt prevents cheap models like gpt5.6 luna

IMPLEMENT the plan completely from start to finish.
DO NOT use placeholders.
DO NOT write comments instead of code.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

snapshotをワークスペースに上書き展開して。

AGENTS.mdと、そこからすべてのdocsを読んで。
アーキテクチャ、コード構造、実行経路が把握できる程度に、現在のコード・caller・testを読んで。

Project Contextからコンテキストを参照することが許可されているが、参照した情報がoutdatedでないことを、提供されたsnapshotやdiffに対して保証する必要がある。

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

デザイン方針には従うが、既存のUIコードに対して保守的にならないで。

既存のUI コードではなく、SVG 側を完成形として考えて。

viewごとにSVGを作成し、それぞれのSVGをInkscapeのCLIで4080×2700 pxのPNGへレンダリングし、zipにまとめて出力して。

長期的に一貫するが過剰にならないように設計する。

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

実装者に判断の余地が残らない簡潔な実装計画を作成して。変更・作成されるファイル構造、各ファイルのコンテンツ・コード構造、APIを固定する。
