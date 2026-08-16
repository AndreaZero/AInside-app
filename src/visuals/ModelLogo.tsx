import { useEffect, useState } from "react";
import { cx } from "../lib/cx";
import {
  fallbackAvatarSrc,
  fetchHfAvatar,
  logoOrgCandidates,
  resolvedLogoUrl,
  subscribeLogos,
  type LogoSource,
} from "../lib/modelLogo";
import { ModelMark } from "./DownloadRig";

export function ModelLogo({
  seed,
  source,
  size = "md",
}: {
  seed: string;
  source?: LogoSource;
  size?: "sm" | "md";
}) {
  const hint = source ?? { id: seed, name: seed };
  const [, bump] = useState(0);
  const [broken, setBroken] = useState(false);
  const apiUrl = resolvedLogoUrl(hint);
  const src = apiUrl ?? fallbackAvatarSrc(hint);

  useEffect(() => subscribeLogos(() => bump((n) => n + 1)), []);
  useEffect(() => {
    for (const org of logoOrgCandidates(hint)) void fetchHfAvatar(org);
  }, [hint.id, hint.name, hint.author, hint.logoOrg, hint.stats?.repo]);
  useEffect(() => {
    setBroken(false);
  }, [apiUrl]);

  if (broken) {
    return <ModelMark seed={seed} />;
  }

  return (
    <span className={cx("model-logo", size === "sm" && "is-sm")}>
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => {
          if (apiUrl && src === apiUrl) {
            setBroken(true);
            return;
          }
          if (apiUrl) return;
          setBroken(true);
        }}
      />
    </span>
  );
}
