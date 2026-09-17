/** Brand glyphs from Font Awesome Free 6.7.2, displayed in neutral gray. */
export default function SocialLogos() {
  return (
    <div className="flex items-center gap-4" aria-label="Redes sociales">
      {[
        { file: 'instagram', label: 'Instagram' },
        { file: 'tiktok', label: 'TikTok' },
        { file: 'facebook', label: 'Facebook' },
      ].map(({ file, label }) => (
        <span key={file} className="inline-flex h-12 w-12 items-center justify-center">
          {/* SVG brand assets keep their original shapes; gray replaces brand color. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/demo-social/${file}.svg`} alt={label} width={26} height={26} className="h-[26px] w-[26px] object-contain" style={{ filter: 'brightness(0) invert(0.6)' }} />
        </span>
      ))}
    </div>
  );
}
