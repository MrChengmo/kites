// A saved Kites profile supplies configuration. Each conversation gets a new
// runtime instance because Agentway permits one active membership per instance.
export function sessionMember(record) {
  const { ID: _id, Key: _key, ...spec } = record.Spec;
  return { agent: { ...spec, Metadata: { ...spec.Metadata, 'kites.profile': record.ID } } };
}
