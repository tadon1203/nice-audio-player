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

SVGをInkscapeのCLIでPNGへレンダリング

長期的な基盤として、ただし過剰にならないように設計する。

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

# Figma SVG Compatibility Rules

FigmaへインポートするSVGは、自己完結した静的SVGとして生成・編集する。

- **ルートを明示する**
  `<svg xmlns="http://www.w3.org/2000/svg">` を使用し、`width`、`height`、`viewBox` を明示する。座標系は可能な限り固定し、編集時に既存の `viewBox` を不用意に変更しない。

- **valid XMLにする**
  UTF-8の正しいXMLとして保存する。タグの閉じ忘れ、重複属性、不正な文字、壊れた参照を残さない。

- **完全に自己完結させる**
  外部CSS、外部SVG、外部画像URL、Web Font、`@import`、リモートリソースへ依存しない。

- **スクリプトを入れない**
  `<script>`、JavaScript URL、`onclick` 等のevent handler、SMIL animationなど、実行時挙動に依存しない。

- **HTMLを埋め込まない**
  `<foreignObject>` やHTML/CSSレイアウトに依存しない。SVG自身の座標とprimitiveだけでレイアウトを完成させる。

- **標準SVG primitiveを優先する**
  主に `g`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon`、`path`、`text`、`image`、`clipPath` を使う。単純な形を不要にpathへ変換しない。

- **レイアウトは明示座標で持つ**
  flex、grid、viewport依存レイアウトを使わず、`x`、`y`、`width`、`height` 等で確定させる。`em`、`rem`、`vw`、`vh` より unitless / px 相当の固定値を優先する。

- **transformは単純にする**
  SVG属性の `transform="translate(...)"`、`scale(...)`、必要最小限のrotateを使う。深いtransform chain、CSS transform、`transform-origin` 依存を避ける。

- **色・stroke・opacityを明示する**
  `fill`、`stroke`、`stroke-width`、`opacity` 等を具体値として持たせる。重要な描画を暗黙の継承だけに依存させない。

- **CSS変数を使わない**
  `var(--token)`、`calc()`、テーマ解決など、外部CSS環境を必要とする値を残さない。生成時に具体値へ解決する。

- **CSS class依存を最小化する**
  Figmaでの再現性を優先する場合、主要なvisual propertyは各SVG要素のpresentation attributesとして持たせる。複雑な `<style>` cascade に依存しない。

- **`currentColor` 等の文脈依存値を避ける**
  import後の解決結果が重要な場合は具体色に展開する。

- **strokeを単純に保つ**
  `stroke-linecap`、`stroke-linejoin` 等の標準属性は使用可。`vector-effect="non-scaling-stroke"` や特殊なstroke挙動に依存しない。

- **clipは単純な `clipPath` を優先する**
  円形cropなどは `clipPath` の `circle` / `rect` / 単純pathで表現する。複雑なmask chainよりclipを優先する。

- **maskは必要な場合だけ使う**
  複雑なalpha/luminance mask、多段mask、maskとfilterの組み合わせは避ける。編集性を優先するなら通常のshape + clipへ単純化する。

- **filter effectを避ける**
  SVG filter、blur、glow、複雑なdrop-shadow、displacement、color matrix等はimport差異やflatten/rasterizationの原因になりやすいため原則使わない。

- **blend modeや高度なcompositingに依存しない**
  `mix-blend-mode`、background compositing等は可能な限り通常のfill / opacityへ単純化する。

- **gradientを使う場合は単純にする**
  通常のlinear/radial gradient程度に留め、複雑なCSS gradient、filterとの組み合わせ、外部参照を使わない。最大の編集性が必要ならsolid fillを優先する。

- **pattern / marker / symbol参照を必要以上に使わない**
  `<pattern>`、`marker`、`symbol`、大量の `<use>` は表示できてもimport後のレイヤー構造が分かりにくくなることがある。編集性を重視する場合は通常のvector nodeへ展開する。

- **`defs` 内の参照はSVG内部だけで完結させる**
  `clipPath`、gradient等を使う場合、IDは一意にし、参照切れを作らない。

- **画像は埋め込む**
  raster artworkが必要なら外部HTTP URLではなく、SVG内にdata URI等として含める。`width` / `height` を明示し、必要なら `preserveAspectRatio` も指定する。

- **画像が不要ならvectorを維持する**
  icon、placeholder、simple artwork等を不必要にPNG化しない。vectorで表現できるものはvectorのままにする。

- **テキストは原則 `<text>` のまま残す**
  import後の編集性を維持するため、通常のUI textをpath化しない。

- **テキスト属性を明示する**
  `font-family`、`font-size`、`font-weight`、`text-anchor`、必要ならletter spacingを明示する。CSSの継承だけに依存しない。

- **Web Fontに依存しない**
  Figma環境に存在しないfontは置換される可能性がある。編集性を優先するならfont substitutionを許容できる構造にする。完全な見た目一致を優先する場合のみtextをoutline化するが、その場合は編集不能になる。

- **高度なtext layoutを避ける**
  `textPath`、複雑な`tspan`配置、`textLength`、`lengthAdjust` 等は、必要不可欠でない限り使わない。通常の独立した `<text>` 要素を優先する。

- **baselineを偶然に任せない**
  テキストは明示的な `x` / `y` と `text-anchor` で配置し、ブラウザのCSS layout結果に依存させない。

- **数値精度を過剰にしない**
  不要な十数桁の浮動小数点値を避け、見た目に必要な精度まで丸める。極端に複雑なpathや巨大なnode数も避ける。

- **semantic groupingを残す**
  screen、section、objectなど意味のある単位を `<g id="...">` でまとめる。Figma import後にもレイヤー構造を追いやすくする。

- **IDは一意にする**
  `id` の重複を避ける。特に `clipPath`、gradient、mask等の参照先IDは必ず一意にする。

- **不要なflatteningをしない**
  複数の編集可能なshapeを巨大な単一pathへ結合しない。Rectangle、Circle、Text等の意味のあるnode構造を保つ。

- **対象外の構造を壊さない**
  既存SVGを部分編集するときは、変更対象外のgroup、coordinates、IDs、viewBoxをなるべく保持する。全面再serializeによる無関係な差分を避ける。

- **SVG metadataは描画に依存させない**
  `<metadata>` やコメントは使用してよいが、見た目や機能の成立条件にしない。

- **静的な第一フレームだけで完成させる**
  hover、animation、JavaScript実行などがなくても、インポート直後のSVG単体でデザインが完成している状態にする。

- **生成後にXML validationを行う**
  XML parserで正常にparseできることを確認する。

- **生成後にrendererで実描画する**
  SVGをPNG等へrasterizeし、clip、transform、text position、overflow、opacityなどが意図どおりか視覚確認する。

- **外部依存チェックを行う**
  最終SVGに `http://` / `https://` 参照、外部stylesheet、CSS variable、script、event handler、未解決resource referenceが残っていないことを確認する。

- **Figma import後の編集性を優先する**
  「SVGとして短いこと」や「高度なSVG機能を使うこと」より、FigmaでRectangle / Ellipse / Vector / Text等として理解しやすい単純な構造を優先する。

- **表示忠実度と編集性が衝突した場合は意図を選ぶ**
  通常は編集性を優先する。完全なpixel fidelityが必須な特殊要素だけ、outline化やraster化を限定的に許可する。

最終判断基準は次の4点。

1. SVG単体で描画できる
2. 外部環境に依存しない
3. Figma import時に特殊機能へ依存しない
4. import後も可能な限りshape / vector / textとして編集できる

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

実装者に判断の余地が残らない簡潔な実装計画を作成して。変更・作成されるファイル構造、各ファイルのコンテンツ・コード構造、APIを固定する。
