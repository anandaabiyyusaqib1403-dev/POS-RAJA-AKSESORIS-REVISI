import { hasAllPermissions, hasAnyPermission } from "../permissions/employeePermissions.js";
import { getEffectiveFeatures } from "../runtime/runtimeFlags.js";

function cloneItem(item) {
  return {
    ...item,
    children: Array.isArray(item.children) ? item.children.map((child) => ({ ...child })) : undefined,
  };
}

export function cloneNavigationSections(sections = []) {
  if (!Array.isArray(sections)) return [];

  return sections.map((section) => ({
    ...section,
    items: Array.isArray(section.items) ? section.items.map(cloneItem) : [],
  }));
}

function isFeatureVisible(item, features) {
  if (!item?.feature) return true;
  return Boolean(features[item.feature]);
}

export function filterNavigationByFeatureFlags(sections, flags) {
  const clonedSections = cloneNavigationSections(sections);
  if (!flags) return clonedSections;

  const features = getEffectiveFeatures(flags);

  return clonedSections
    .map((section) => {
      const items = section.items
        .filter((item) => isFeatureVisible(item, features))
        .map((item) => {
          if (!Array.isArray(item.children)) return item;

          return {
            ...item,
            children: item.children.filter((child) => isFeatureVisible(child, features)),
          };
        })
        .filter((item) => !Array.isArray(item.children) || item.children.length > 0 || !item.children);

      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}

function hasRequiredPermissions(permissions, item) {
  const requiredPermissions = item?.requiredPermissions;
  if (!requiredPermissions) return true;

  if (item.permissionMode === "all") {
    return hasAllPermissions(permissions, requiredPermissions);
  }

  return hasAnyPermission(permissions, requiredPermissions);
}

export function filterNavigationByPermissions(sections, permissions) {
  const clonedSections = cloneNavigationSections(sections);
  if (!permissions) return clonedSections;

  return clonedSections
    .map((section) => {
      const items = section.items
        .filter((item) => hasRequiredPermissions(permissions, item))
        .map((item) => {
          if (!Array.isArray(item.children)) return item;

          return {
            ...item,
            children: item.children.filter((child) => hasRequiredPermissions(permissions, child)),
          };
        })
        .filter((item) => !Array.isArray(item.children) || item.children.length > 0 || !item.children);

      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}
