import type { TemplateProps } from "./types";
export type { TemplateProps } from "./types";

import { ModernTemplate } from "./modern";
import { ClassicTemplate } from "./classic";
import { MinimalTemplate } from "./minimal";
import { CompactTemplate } from "./compact";

export const TEMPLATE_REGISTRY: Record<
  string,
  React.FC<TemplateProps>
> = {
  modern: ModernTemplate,
  classic: ClassicTemplate,
  minimal: MinimalTemplate,
  compact: CompactTemplate,
};

export { ModernTemplate, ClassicTemplate, MinimalTemplate, CompactTemplate };
