"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { renderBlocks } from "@/lib/editor/blocks";

interface SpotlightSectionProps {
  contentBlocks: any[] | null;
  userId?: string;
}

export default function SpotlightSection({ contentBlocks, userId }: SpotlightSectionProps) {
  if (!contentBlocks || contentBlocks.length === 0) {
    return null;
  }

  const htmlContent = renderBlocks(contentBlocks);

  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="rounded-xl shadow-lg border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      {/* @ts-ignore */}
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon icon="heroicons:megaphone" className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-default-900">Mensaje Destacado</h3>
        </div>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </CardContent>
    </Card>
  );
}
