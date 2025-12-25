import { chromium } from "playwright";
import fs from "fs";

const URL = "https://gemini.google.com/share/6294ee928648";
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS ?? 90000);
const POST_LOAD_WAIT_MS = Number(process.env.POST_LOAD_WAIT_MS ?? 5000);
const CONTENT_TIMEOUT_MS = Number(process.env.CONTENT_TIMEOUT_MS ?? 45000);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 60);
const MIN_TEXT_LENGTH = Number(process.env.MIN_TEXT_LENGTH ?? 12);
const TEXT_BLOCKLIST = new Set([
  "Cover",
  "Listen",
  "Report content",
  "Create a storybook",
  "Opens in a new window",
  "",
  null
]);
const DEBUG = process.env.DEBUG_SCRAPER === "1";

const dataDir = "data";

function normalizeText(raw) {
  if (!raw) {
    return "";
  }
  return raw.replace(/\s+/g, " ").trim();
}

async function getCurrentSpreadData(page) {
  return page.evaluate(() => {
    const pickSpread = () => {
      const candidates = Array.from(document.querySelectorAll(".spread-container"));
      const filtered = candidates.filter(el => !el.classList.contains("bottom-pages") && !el.classList.contains("hide"));
      if (filtered.length) return filtered[0];
      return candidates.find(el => !el.classList.contains("bottom-pages")) || candidates[0] || null;
    };

    const spread = pickSpread();
    if (!spread) {
      return null;
    }

    const pageLabelEl =
      document.querySelector("[data-test-id='jump-to-page-button-page-label']") ||
      spread.querySelector(".footer-page-number") ||
      spread.querySelector(".page-number");
    const pageLabel = pageLabelEl ? pageLabelEl.textContent?.trim() : "";

    const collectText = () => {
      const primaryTextRoot =
        spread.querySelector('.page-content.main.right') ||
        spread.querySelector('.page-content.right:not(.underneath):not(.back)');

      const selectors = [
        ".story-text",
        ".story-text-container",
        ".cover-title",
        ".page-title"
      ];
      const chunks = [];
      const seen = new Set();
      selectors.forEach(selector => {
        (primaryTextRoot || spread).querySelectorAll(selector).forEach(node => {
          const value = node.innerText?.trim();
          if (value && !seen.has(value)) {
            seen.add(value);
            chunks.push(value);
          }
        });
      });
      if (!chunks.length) {
        const fallback = primaryTextRoot || spread.querySelector(".page-content.right") || spread;
        const value = fallback.innerText?.trim();
        if (value && !seen.has(value)) {
          seen.add(value);
          chunks.push(value);
        }
      }
      return chunks.join("\n\n");
    };

    const collectImage = () => {
      const isCover = /cover/i.test(pageLabel || "") || pageLabel === "";

      if (isCover) {
        const coverImg = document.querySelector(".cover img[src*='googleusercontent.com']");
        if (coverImg) {
          return coverImg.currentSrc || coverImg.src;
        }
      }

      const selectors = [
        ".page-content.main.left img[src*='googleusercontent.com']",
        ".page-content.left img[src*='googleusercontent.com']",
        ".page-content.right img[src*='googleusercontent.com']",
        "img[src*='googleusercontent.com']"
      ];
      for (const selector of selectors) {
        const el = spread.querySelector(selector);
        if (el) {
          return el.currentSrc || el.src;
        }
      }
      return null;
    };

    return {
      text: collectText(),
      imageUrl: collectImage(),
      pageLabel
    };
  });
}

async function waitForSpreadChange(page, previousState) {
  await page
    .waitForFunction(prev => {
      const pickSpread = () => {
        const candidates = Array.from(document.querySelectorAll(".spread-container"));
        const filtered = candidates.filter(el => !el.classList.contains("bottom-pages") && !el.classList.contains("hide"));
        if (filtered.length) return filtered[0];
        return candidates.find(el => !el.classList.contains("bottom-pages")) || candidates[0] || null;
      };

      const spread = pickSpread();
      if (!spread) {
        return false;
      }
      const textNode =
        spread.querySelector(".page-content.right .story-text") ||
        spread.querySelector(".page-content.right") ||
        spread;
      const text = textNode?.innerText?.trim().replace(/\s+/g, " ").trim();
      const pageLabelEl = spread.querySelector(".footer-page-number") || spread.querySelector(".page-number");
      const label = pageLabelEl ? pageLabelEl.textContent?.trim() : "";
      const imageEl =
        spread.querySelector(".page-content.left img[src*='googleusercontent.com']") ||
        spread.querySelector("img[src*='googleusercontent.com']");
      const imageUrl = imageEl ? imageEl.currentSrc || imageEl.src : null;
      const textChanged = text && prev.text !== text;
      const labelChanged = label && prev.pageLabel !== label;
      const imageChanged = imageUrl && prev.imageUrl !== imageUrl;
      return textChanged || labelChanged || imageChanged;
    }, previousState, { timeout: CONTENT_TIMEOUT_MS })
    .catch(() => null);
}

async function isNextDisabled(nextButton) {
  if ((await nextButton.count()) === 0) {
    return true;
  }
  return nextButton
    .evaluate(btn => {
      if (!btn) {
        return true;
      }
      return (
        btn.disabled ||
        btn.getAttribute("aria-disabled") === "true" ||
        btn.classList.contains("mat-mdc-button-disabled")
      );
    })
    .catch(() => true);
}

async function clickStartOver(page) {
  await page.evaluate(() => {
    const startOver = document.querySelector("button.start-over-button");
    startOver?.click();
  });
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log("browser ready");

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(POST_LOAD_WAIT_MS);
  } catch (error) {
    fs.mkdirSync(dataDir, { recursive: true });
    await page.screenshot({ path: `${dataDir}/navigation-error.png`, fullPage: true }).catch(() => null);
    await browser.close();
    throw new Error(`Failed to load story share URL. ${error.message}`);
  }

  try {
    await clickStartOver(page);
    const nextButton = page.locator("button[aria-label='Next page']").first();
    await nextButton.waitFor({ timeout: CONTENT_TIMEOUT_MS }).catch(() => null);

    if (DEBUG) {
      const spreadHtml = await page.evaluate(() => {
        const el = document.querySelector(".spread-container:not(.hide)");
        return el ? el.innerHTML : null;
      });
      console.log("initial spread snippet:", spreadHtml?.slice(0, 2000));
      const spreadCount = await page.evaluate(() => document.querySelectorAll(".spread-container:not(.hide)").length);
      console.log("visible spread count:", spreadCount);
      const storyTextSamples = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".story-text"))
          .slice(0, 3)
          .map(el => el.innerText)
      );
      console.log("story-text samples:", storyTextSamples);
      const shadowInfo = await page.evaluate(() => {
        const el = document.querySelector("storybook-page");
        return {
          exists: Boolean(el),
          hasShadowRoot: Boolean(el?.shadowRoot)
        };
      });
      console.log("storybook element:", shadowInfo);
    }

    const pages = [];
    const seenKeys = new Set();
    const seenLabels = new Set();
    let iterations = 0;
    let repeatedSnapshots = 0;

    while (iterations < MAX_PAGES) {
      iterations += 1;
      const snapshot = await getCurrentSpreadData(page);
      if (!snapshot) {
        break;
      }

      const normalizedText = normalizeText(snapshot.text);
      const textIsValid =
        normalizedText.length >= MIN_TEXT_LENGTH &&
        !TEXT_BLOCKLIST.has(normalizedText);
      const key = `${snapshot.pageLabel || pages.length}|${normalizedText}|${snapshot.imageUrl || "no-image"}`;

      if (DEBUG) {
        console.log(`snapshot ${iterations}: label=${snapshot.pageLabel} img=${snapshot.imageUrl?.slice(0, 60) || "none"}`);
        console.log(`text (${normalizedText.length} chars): ${normalizedText}`);
      }

      if (textIsValid && !seenKeys.has(key) && !(snapshot.pageLabel && seenLabels.has(snapshot.pageLabel))) {
        pages.push({
          id: pages.length + 1,
          text: normalizedText,
          imageUrl: snapshot.imageUrl
        });
        seenKeys.add(key);
        if (snapshot.pageLabel) {
          seenLabels.add(snapshot.pageLabel);
        }
        repeatedSnapshots = 0;
      } else {
        repeatedSnapshots += 1;
      }

      const nextDisabled = await isNextDisabled(nextButton);
      if (DEBUG) {
        console.log("nextDisabled?", nextDisabled, "repeated", repeatedSnapshots);
      }
      if (repeatedSnapshots >= 3) {
        break;
      }

      if (nextDisabled) {
        await page.evaluate(() => {
          const btn = document.querySelector("button[aria-label='Next page']");
          if (btn) {
            btn.removeAttribute("disabled");
            btn.classList.remove("mat-mdc-button-disabled");
          }
        });
      }

      await nextButton.click({ force: true });
      await waitForSpreadChange(page, {
        pageLabel: snapshot.pageLabel,
        text: normalizedText,
        imageUrl: snapshot.imageUrl
      });
      await page.waitForTimeout(500);
    }

    if (!pages.length) {
      throw new Error("Failed to capture story content. The page structure may have changed.");
    }

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(`${dataDir}/story.json`, JSON.stringify({ pages }, null, 2), "utf-8");
    console.log("✔ story.json generated successfully");
  } catch (error) {
    fs.mkdirSync(dataDir, { recursive: true });
    await page.screenshot({ path: `${dataDir}/navigation-error.png`, fullPage: true }).catch(() => null);
    throw error;
  } finally {
    await browser.close();
  }
})();
