// ============================================================
// Browser-side Selector Synthesis Source
//
// This module exports a single function that returns a self-contained
// JavaScript source string. The string, when evaluated in a page's MAIN
// world, defines a `synthesizeElementLocators(el)` function that produces
// a ranked list of CSS / link_text / id / name locators for the given
// element, each with a stability score and verification info.
//
// Origin: ported verbatim from browser-agent-wxt's
// `browserSelectorSynthesisSource()` (services/browser-selector-synthesis.ts).
// The scoring table (PRIMARY_ATTRIBUTES order, 5/8/9/12/15/35/45/65/80/110/
// 1000+ score bands) is battle-tested and should NOT be re-tuned casually.
//
// NOTE on MAX_CLASS_TOKENS_FOR_SELECTOR:
//   The upstream sets this to `null` (unlimited), which causes
//   `combinations(tokens, 2)` to blow up on elements with many classes.
//   We set it to 8 here as a safety bound — it matches the upstream's own
//   commented-out hint (`// 8`) and prevents combinatorial explosion while
//   keeping coverage for realistic class counts.
// ============================================================

export const MAX_CLASS_TOKENS_FOR_SELECTOR = 8

/**
 * Returns a self-contained JS source string. When evaluated in a page
 * context, it defines `synthesizeElementLocators` on the enclosing scope.
 *
 * The returned string uses String.raw to preserve backslashes and `\0`
 * (NUL) separators verbatim — do NOT re-escape or pretty-print it.
 */
export function browserSelectorSynthesisSource(): string {
  return String.raw`
const synthesizeElementLocators = (() => {
  const PRIMARY_ATTRIBUTES = ["data-testid","data-test","data-qa","aria-label","title","placeholder","alt","name","role","type","value"];
  const MAX_LOCATORS_PER_NODE = 5;
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const cssIdent = (value) => {
    const raw = String(value || "");
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(raw);
    return raw.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };
  const cssValue = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const isConcreteTag = (tag) => /^[a-z][a-z0-9_-]*$/.test(tag);
  const tagOf = (el) => {
    if (!(el instanceof Element)) return "*";
    const tag = normalize(el.tagName).toLowerCase();
    return isConcreteTag(tag) ? tag : "*";
  };
  const getTraversalParent = (el) => {
    if (!(el instanceof Element)) return null;
    if (el.parentElement instanceof Element) return el.parentElement;
    const root = typeof el.getRootNode === "function" ? el.getRootNode() : null;
    if (root && root !== document && root.host instanceof Element) return root.host;
    return null;
  };
  const getTagIndex = (el) => {
    const parent = getTraversalParent(el);
    if (!(el instanceof Element) || !(parent instanceof Element)) return 1;
    const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === el.tagName);
    const index = siblings.indexOf(el);
    return index === -1 ? 1 : index + 1;
  };
  const getPath = (el) => {
    const segments = [];
    let current = el;
    while (current instanceof Element) {
      segments.unshift({ tag: tagOf(current), index: getTagIndex(current) });
      if (current === document.documentElement) break;
      current = getTraversalParent(current);
    }
    return segments;
  };
  const pathQuery = (segments, includeFirstIndexes) => segments
    .map((segment) => !includeFirstIndexes && segment.index === 1 ? segment.tag : segment.tag + ":nth-of-type(" + segment.index + ")")
    .join(" > ");
  const countCssMatches = (selector) => document.querySelectorAll(selector).length;
  const firstCssMatch = (selector) => document.querySelector(selector);
  const verifyCss = (el, selector) => countCssMatches(selector) === 1 && firstCssMatch(selector) === el;
  const getClassTokens = (el) => {
    if (!(el instanceof Element)) return [];
    const seen = new Set();
    const result = [];
    for (const token of Array.from(el.classList || [])) {
      const normalized = normalize(token);
      if (!normalized || normalized.length > 128 || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  };
  const combinations = (values, size) => {
    const result = [];
    const walk = (start, bucket) => {
      if (bucket.length === size) {
        result.push(bucket.slice());
        return;
      }
      for (let index = start; index < values.length; index += 1) {
        bucket.push(values[index]);
        walk(index + 1, bucket);
        bucket.pop();
      }
    };
    walk(0, []);
    return result;
  };
  const makeLocator = (query, verification, stability, score, strategy) => ({
    kind: "css",
    query,
    verification,
    stability,
    score,
    strategy,
  });
  const attrSelector = (tag, attrName, attrValue) => tag + "[" + attrName + "=\"" + cssValue(attrValue) + "\"]";
  const classSelector = (tag, group) => tag + group.map((token) => "." + cssIdent(token)).join("");
  const simpleFragments = (el) => {
    const tag = tagOf(el);
    const fragments = [];
    if (tag !== "*") {
      fragments.push({
        query: tag,
        verification: "tag",
        stability: "low",
        score: 80,
      });
    }
    for (const attrName of PRIMARY_ATTRIBUTES) {
      const attrValue = normalize(el.getAttribute(attrName) || "");
      if (!attrValue || tag === "*") continue;
      const stable = attrName.indexOf("data-") === 0 || attrName === "aria-label";
      fragments.push({
        query: attrSelector(tag, attrName, attrValue),
        verification: "css_attribute:" + attrName,
        stability: stable ? "high" : "medium",
        score: stable ? 15 : 35,
      });
    }
    const classTokens = getClassTokens(el).sort((left, right) => {
      if (right.length !== left.length) return right.length - left.length;
      return left.localeCompare(right);
    }).slice(0, ${MAX_CLASS_TOKENS_FOR_SELECTOR});
    for (let size = 1; size <= Math.min(2, classTokens.length); size += 1) {
      for (const group of combinations(classTokens, size)) {
        if (tag === "*") continue;
        fragments.push({
          query: classSelector(tag, group),
          verification: "css_class_subset:" + group.join(","),
          stability: size === 1 ? "medium" : "low",
          score: size === 1 ? 45 : 65,
        });
      }
    }
    if (tag !== "*") {
      fragments.push({
        query: tag + ":nth-of-type(" + getTagIndex(el) + ")",
        verification: "css_ordinal_self",
        stability: "low",
        score: 110,
      });
    }
    return fragments;
  };
  const addLocator = (locators, seen, locator) => {
    const query = normalize(locator.query);
    if (!query) return;
    const key = locator.kind + "|" + query;
    if (seen.has(key)) return;
    seen.add(key);
    locators.push({ ...locator, query });
  };
  const uniqueAnchorFragments = (ancestor, depth) => {
    const fragments = [];
    for (const fragment of simpleFragments(ancestor)) {
      if (verifyCss(ancestor, fragment.query)) {
        fragments.push(fragment);
      }
    }
    const path = getPath(ancestor);
    for (let suffixLength = 1; suffixLength <= path.length; suffixLength += 1) {
      const suffix = path.slice(path.length - suffixLength);
      const compact = pathQuery(suffix, false);
      if (compact && verifyCss(ancestor, compact)) {
        fragments.push({
          query: compact,
          verification: "css_path_suffix_unique:" + suffixLength,
          stability: suffixLength <= 2 ? "medium" : "low",
          score: 130 + suffixLength * 5 + depth,
        });
        break;
      }
      const strict = pathQuery(suffix, true);
      if (strict && verifyCss(ancestor, strict)) {
        fragments.push({
          query: strict,
          verification: "css_path_suffix_indexed_unique:" + suffixLength,
          stability: "low",
          score: 170 + suffixLength * 5 + depth,
        });
        break;
      }
    }
    return fragments;
  };
  const relativePathFromAncestor = (target, ancestor) => {
    const targetPath = getPath(target);
    const ancestorPath = getPath(ancestor);
    return targetPath.slice(ancestorPath.length);
  };
  return (el) => {
    if (!(el instanceof Element)) return [];
    const locators = [];
    const seen = new Set();
    const tag = tagOf(el);
    const text = normalize(el.textContent || el.getAttribute("aria-label") || "");
    const role = normalize(el.getAttribute("role") || "");
    if ((tag === "a" || role === "link") && text) {
      const links = Array.from(document.querySelectorAll('a,[role="link"]')).filter(
        (candidate) => normalize(candidate.textContent || candidate.getAttribute("aria-label") || "") === text
      );
      const index = links.indexOf(el);
      if (index !== -1) {
        addLocator(locators, seen, {
          kind: "link_text",
          query: links.length === 1 ? text : text + "@POS=" + String(index + 1),
          verification: links.length === 1 ? "link_text_exact_unique" : "link_text_position",
          stability: links.length === 1 ? "high" : "medium",
          score: links.length === 1 ? 5 : 60,
          strategy: "semantic_text",
        });
      }
    }
    const idValue = normalize(el.getAttribute("id") || "");
    const idSelector = "[id=\"" + cssValue(idValue) + "\"]";
    if (idValue && verifyCss(el, idSelector)) {
      addLocator(locators, seen, {
        kind: "id",
        query: idValue,
        verification: "id_unique",
        stability: "high",
        score: 8,
        strategy: "semantic_attribute",
      });
      addLocator(locators, seen, makeLocator(idSelector, "css_id_unique", "high", 9, "semantic_attribute"));
    }
    const nameValue = normalize(el.getAttribute("name") || "");
    if (nameValue && tag !== "*" && verifyCss(el, attrSelector(tag, "name", nameValue))) {
      addLocator(locators, seen, {
        kind: "name",
        query: nameValue,
        verification: "name_with_tag_unique",
        stability: "high",
        score: 12,
        strategy: "semantic_attribute",
      });
    }
    for (const fragment of simpleFragments(el)) {
      if (verifyCss(el, fragment.query)) {
        addLocator(locators, seen, makeLocator(fragment.query, fragment.verification + "_unique", fragment.stability, fragment.score, "single_selector"));
      }
    }
    const targetFragments = simpleFragments(el);
    let ancestor = getTraversalParent(el);
    let depth = 1;
    while (ancestor instanceof Element) {
      for (const anchor of uniqueAnchorFragments(ancestor, depth)) {
        for (const fragment of targetFragments) {
          const query = anchor.query + " " + fragment.query;
          if (verifyCss(el, query)) {
            addLocator(
              locators,
              seen,
              makeLocator(
                query,
                "css_descendant_unique:" + anchor.verification + "->" + fragment.verification,
                anchor.stability === "high" && fragment.stability !== "low" ? "high" : fragment.stability === "high" ? "medium" : "low",
                (anchor.score || 100) + (fragment.score || 100) + depth * 3,
                "anchored_descendant"
              )
            );
          }
        }
        const relativePath = relativePathFromAncestor(el, ancestor);
        if (relativePath.length > 0) {
          const query = anchor.query + " > " + pathQuery(relativePath, true);
          if (verifyCss(el, query)) {
            addLocator(
              locators,
              seen,
              makeLocator(query, "css_anchored_path_unique:depth_" + depth, "low", (anchor.score || 100) + 240 + depth * 8, "anchored_path")
            );
          }
        }
      }
      if (ancestor === document.documentElement) break;
      ancestor = getTraversalParent(ancestor);
      depth += 1;
    }
    const fullPath = pathQuery(getPath(el), true);
    if (fullPath && verifyCss(el, fullPath)) {
      addLocator(locators, seen, makeLocator(fullPath, "css_full_path_unique", "low", 1000 + getPath(el).length, "full_path"));
    }
    locators.sort((left, right) => {
      const scoreDiff = (left.score || 0) - (right.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return left.query.length - right.query.length;
    });
    return locators.slice(0, MAX_LOCATORS_PER_NODE);
  };
})();
`
}
