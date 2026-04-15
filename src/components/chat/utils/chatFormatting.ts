export function decodeHtmlEntities(text: string) {
  if (!text) return text;
  // Decode numeric (&#123; &#x1F;) and named (&lt; &gt; etc.) HTML entities
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // &amp; must be last to avoid double-decoding
}

export function normalizeInlineCodeFences(text: string) {
  if (!text || typeof text !== 'string') return text;
  try {
    return text.replace(/```\s*([^\n\r]+?)\s*```/g, '`$1`');
  } catch {
    return text;
  }
}

export function unescapeWithMathProtection(text: string) {
  if (!text || typeof text !== 'string') return text;

  const mathBlocks: string[] = [];
  const placeholderPrefix = '__MATH_BLOCK_';
  const placeholderSuffix = '__';

  let processedText = text.replace(/\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$/g, (match) => {
    const index = mathBlocks.length;
    mathBlocks.push(match);
    return `${placeholderPrefix}${index}${placeholderSuffix}`;
  });

  processedText = processedText.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');

  processedText = processedText.replace(
    new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, 'g'),
    (match, index) => {
      return mathBlocks[parseInt(index, 10)];
    },
  );

  return processedText;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatUsageLimitText(text: string) {
  try {
    if (typeof text !== 'string') return text;

    // Official format: "Claude AI usage limit reached|<timestamp>"
    let result = text.replace(/Claude AI usage limit reached\|(\d{10,13})/g, (match, ts) => {
      let timestampMs = parseInt(ts, 10);
      if (!Number.isFinite(timestampMs)) return match;
      if (timestampMs < 1e12) timestampMs *= 1000;
      const reset = new Date(timestampMs);

      const timeStr = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(reset);

      const offsetMinutesLocal = -reset.getTimezoneOffset();
      const sign = offsetMinutesLocal >= 0 ? '+' : '-';
      const abs = Math.abs(offsetMinutesLocal);
      const offH = Math.floor(abs / 60);
      const offM = abs % 60;
      const gmt = `GMT${sign}${offH}${offM ? ':' + String(offM).padStart(2, '0') : ''}`;
      const tzId = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const cityRaw = tzId.split('/').pop() || '';
      const city = cityRaw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
      const tzHuman = city ? `${gmt} (${city})` : gmt;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateReadable = `${reset.getDate()} ${months[reset.getMonth()]} ${reset.getFullYear()}`;

      return `Claude usage limit reached. Your limit will reset at **${timeStr} ${tzHuman}** - ${dateReadable}`;
    });

    // Proxy / non-official rate limit patterns — provide a friendly message
    if (result === text) {
      result = result.replace(
        /(?:rate.?limit|too.?many.?requests|quota.?exceeded|429|throttl)/gi,
        (match) => {
          // Only wrap the first occurrence to avoid duplicating the hint
          return match;
        },
      );
      // If the text clearly indicates a rate limit but wasn't formatted above,
      // add a prefix hint
      if (/(?:rate.?limit|too.?many.?requests|quota.?exceeded)/i.test(result) &&
          !result.includes('usage limit reached')) {
        result = `⚠️ Rate limit: ${result}`;
      }
    }

    return result;
  } catch {
    return text;
  }
}
