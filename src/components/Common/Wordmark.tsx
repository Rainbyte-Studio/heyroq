import React from 'react';
import { BRAND_IDENTITY } from '../../config/brandConfig';

export type WordmarkSize = 'nav' | 'header' | 'modal' | 'footer';

export interface WordmarkProps {
  id?: string;
  as?: 'span' | 'h1' | 'div';
  size?: WordmarkSize;
  className?: string;
}

const SIZE_CLASSES: Record<WordmarkSize, string> = {
  // Mobile 27px, Tablet 30px, Desktop 34px — optically calibrated for Momo Signature Regular 400
  nav: 'text-[27px] sm:text-[30px] lg:text-[34px]',
  // Info/Legal page headers: 27px mobile, 30px tablet, 33px desktop
  header: 'text-[27px] sm:text-[30px] lg:text-[33px]',
  // Auth & About modals: prominent featured signature wordmark
  modal: 'text-[32px] sm:text-[36px]',
  // Footers & secondary surfaces
  footer: 'text-[25px] sm:text-[28px]',
};

/**
 * Canonical Heyroq Brand Wordmark ("heyroq")
 * - Font: Momo Signature Regular (400 only), upright, zero synthetic bold/italic
 * - Color: Solaris Orange Primary (#E87924 / var(--brand-primary))
 * - Strictly clean: no text shadows, metallic bevels, gradients, outlines, or glass/blur effects
 * - Optical padding prevents clipping of Momo Signature ascenders and 'y' / 'q' descenders
 */
export const Wordmark: React.FC<WordmarkProps> = ({
  id,
  as: Component = 'span',
  size,
  className = '',
}) => {
  const responsiveSize = size ? SIZE_CLASSES[size] : '';
  return (
    <Component
      id={id}
      className={`heyroq-wordmark inline-block select-none whitespace-nowrap shrink-0 ${responsiveSize} ${className}`.trim()}
    >
      {BRAND_IDENTITY.wordmarkText}
    </Component>
  );
};
