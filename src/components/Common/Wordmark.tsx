import React from 'react';
import { BRAND_IDENTITY } from '../../config/brandConfig';

export type WordmarkSize = 'nav' | 'header' | 'modal' | 'footer' | 'compact';
export type WordmarkVariant = 'brand' | 'light' | 'dark' | 'mono';

export interface WordmarkProps {
  id?: string;
  as?: 'span' | 'h1' | 'div';
  size?: WordmarkSize;
  variant?: WordmarkVariant;
  className?: string;
}

const SIZE_HEIGHT_CLASSES: Record<WordmarkSize, string> = {
  // Full Concept B vector wordmark heights (aspect ratio 545:99 ≈ 5.505:1)
  nav: 'h-[21px] sm:h-[23px] lg:h-[25px] w-auto',
  header: 'h-[22px] sm:h-[24px] lg:h-[26px] w-auto',
  modal: 'h-[26px] sm:h-[30px] w-auto',
  footer: 'h-[19px] sm:h-[22px] w-auto',
  // Compact standalone 'q' mark
  compact: 'h-[26px] w-[26px]',
};

const VARIANT_COLOR_CLASSES: Record<WordmarkVariant, string> = {
  brand: 'text-[#E87924]',
  light: 'text-[#E87924]',
  dark: 'text-[#E87924]',
  mono: 'text-[#202124] dark:text-[#F5F4F1]',
};

/**
 * Canonical Heyroq Brand Wordmark — Concept B Custom Signature
 * - Outlined vector SVG built on Syne ExtraBold 800 geometry with customized 45° angled 'q' descender terminal
 * - Zero runtime font-loading flash, zero shadows, zero metallic bevels, zero gradients
 * - Supports full wordmark (`nav` | `header` | `modal` | `footer`) and compact `q` mark (`compact`)
 */
export const Wordmark: React.FC<WordmarkProps> = ({
  id,
  as: Component = 'span',
  size = 'nav',
  variant = 'brand',
  className = '',
}) => {
  const sizeClass = SIZE_HEIGHT_CLASSES[size];
  const colorClass = VARIANT_COLOR_CLASSES[variant];
  const isCompact = size === 'compact';

  return (
    <Component
      id={id}
      className={`heyroq-wordmark inline-flex items-center select-none shrink-0 ${colorClass} ${className}`.trim()}
    >
      {isCompact ? (
        <svg
          viewBox="0 0 128 128"
          fill="none"
          role="img"
          aria-label={BRAND_IDENTITY.wordmarkText}
          className={`${sizeClass} block shrink-0`}
        >
          <title>{BRAND_IDENTITY.wordmarkText}</title>
          <g fill="currentColor">
            <path
              fillRule="nonzero"
              d="M52.15 78.7Q41.35 78.7 32.95 75.8Q24.55 72.9 19.7 67.1Q14.85 61.3 14.85 52.7Q14.85 44.5 19.7 38.7Q24.55 32.9 32.95 29.85Q41.35 26.8 52.15 26.8Q61.15 26.8 68.35 28.65Q75.55 30.5 80.65 33.95Q85.75 37.4 88.45 42.15Q91.15 46.9 91.15 52.7Q91.15 58.5 88.45 63.3Q85.75 68.1 80.65 71.55Q75.55 75 68.35 76.85Q61.15 78.7 52.15 78.7ZM61.15 63.4Q68.75 63.4 75.1 62.5Q81.45 61.6 85.3 59.25Q89.15 56.9 89.15 52.7Q89.15 48.5 85.3 46.15Q81.45 43.8 75.1 42.9Q68.75 42 61.15 42Q50.95 42 45.35 44.7Q39.75 47.4 39.75 52.7Q39.75 56.3 42.25 58.65Q44.75 61 49.55 62.2Q54.35 63.4 61.15 63.4Z"
            />
            <path
              fillRule="nonzero"
              d="M90.55 28.2L113.15 28.2L113.15 99.2L89.15 88.2L89.15 47.2Z"
            />
          </g>
        </svg>
      ) : (
        <svg
          viewBox="0 0 545 99"
          fill="none"
          role="img"
          aria-label={BRAND_IDENTITY.wordmarkText}
          className={`${sizeClass} block shrink-0`}
        >
          <title>{BRAND_IDENTITY.wordmarkText}</title>
          <g fill="currentColor">
            <path
              fillRule="nonzero"
              d="M94.8 73L70.8 73L70.8 54.8Q70.8 50.3 69 47.2Q67.2 44.1 62.65 42.55Q58.1 41 49.8 41Q45.1 41 40.65 41.85Q36.2 42.7 32.65 43.9Q29.1 45.1 27 46.3L26.8 41.5Q27.2 40 29.55 36.95Q31.9 33.9 36.4 30.55Q40.9 27.2 47.75 24.85Q54.6 22.5 64 22.5Q69.9 22.5 75.4 23.6Q80.9 24.7 85.25 27.25Q89.6 29.8 92.2 34.1Q94.8 38.4 94.8 44.8L94.8 73ZM28 73L4 73L4 4L28 4Z"
            />
            <path
              fillRule="nonzero"
              d="M172.1 55.4L195.7 55.4Q194.8 61.2 189.95 65.5Q185.1 69.8 175.85 72.15Q166.6 74.5 152.3 74.5Q137.2 74.5 126.25 72.1Q115.3 69.7 109.4 64Q103.5 58.3 103.5 48.6Q103.5 39 109.25 33.25Q115 27.5 125.9 25Q136.8 22.5 152.3 22.5Q167.5 22.5 177.2 25.2Q186.9 27.9 191.5 33.95Q196.1 40 195.9 50.3L127.9 50.3Q128.4 52.9 130.75 55.1Q133.1 57.3 138.05 58.65Q143 60 151.3 60Q159.9 60 165.45 58.8Q171 57.6 172.1 55.4ZM151.3 37Q140.7 37 135.15 39.3Q129.6 41.6 128.6 43.9L172.6 43.9Q171.9 41.3 167 39.15Q162.1 37 151.3 37Z"
            />
            <path
              fillRule="nonzero"
              d="M229.5 73L195.5 24L221 24L250.2 71L229.5 73ZM262 24L287.5 24L238.8 93L214.3 93L235.2 64.7Z"
            />
            <path
              fillRule="nonzero"
              d="M289 73L289 24L313 24L313 73L289 73ZM338.8 22.5L338.8 42.5Q332.3 42.5 326.9 43.7Q321.5 44.9 317.7 46.55Q313.9 48.2 312 49.8L311.8 45Q312.1 42.9 313.4 40.05Q314.7 37.2 316.9 34.15Q319.1 31.1 322.3 28.45Q325.5 25.8 329.65 24.15Q333.8 22.5 338.8 22.5Z"
            />
            <path
              fillRule="nonzero"
              d="M390 74.5Q374.1 74.5 363.55 71.9Q353 69.3 347.75 63.6Q342.5 57.9 342.5 48.6Q342.5 39.3 347.75 33.55Q353 27.8 363.55 25.15Q374.1 22.5 390 22.5Q405.8 22.5 416.25 25.15Q426.7 27.8 431.9 33.55Q437.1 39.3 437.1 48.6Q437.1 57.9 431.9 63.6Q426.7 69.3 416.25 71.9Q405.8 74.5 390 74.5ZM390 60Q397.4 60 402.4 58.75Q407.4 57.5 410 54.95Q412.6 52.4 412.6 48.6Q412.6 44.8 410.05 42.2Q407.5 39.6 402.5 38.3Q397.5 37 390 37Q382.6 37 377.45 38.3Q372.3 39.6 369.65 42.15Q367 44.7 367 48.6Q367 52.4 369.6 54.95Q372.2 57.5 377.35 58.75Q382.5 60 390 60Z"
            />
            <path
              fillRule="nonzero"
              d="M479.8 74.5Q469 74.5 460.6 71.6Q452.2 68.7 447.35 62.9Q442.5 57.1 442.5 48.5Q442.5 40.3 447.35 34.5Q452.2 28.7 460.6 25.65Q469 22.6 479.8 22.6Q488.8 22.6 496 24.45Q503.2 26.3 508.3 29.75Q513.4 33.2 516.1 37.95Q518.8 42.7 518.8 48.5Q518.8 54.3 516.1 59.1Q513.4 63.9 508.3 67.35Q503.2 70.8 496 72.65Q488.8 74.5 479.8 74.5ZM488.8 59.2Q496.4 59.2 502.75 58.3Q509.1 57.4 512.95 55.05Q516.8 52.7 516.8 48.5Q516.8 44.3 512.95 41.95Q509.1 39.6 502.75 38.7Q496.4 37.8 488.8 37.8Q478.6 37.8 473 40.5Q467.4 43.2 467.4 48.5Q467.4 52.1 469.9 54.45Q472.4 56.8 477.2 58Q482 59.2 488.8 59.2Z"
            />
            <path
              fillRule="nonzero"
              d="M518.2 24L540.8 24L540.8 95L516.8 84L516.8 43Z"
            />
          </g>
        </svg>
      )}
    </Component>
  );
};
