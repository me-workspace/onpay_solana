import type { Metadata } from "next";

import { SettingsClient } from "./_components/settings-client";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage(): React.JSX.Element {
  return <SettingsClient />;
}
