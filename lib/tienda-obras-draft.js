export function isProjectDraftDirty(draftSnapshot, savedSnapshot, version) {
  return Boolean(draftSnapshot && (Number(version) === 0 || savedSnapshot == null || draftSnapshot !== savedSnapshot));
}
