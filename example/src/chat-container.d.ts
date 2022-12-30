export type ChatContainerBaseProps = {
  privateKey: string;
  chatAccount: string;
  userFields: { fields: Record<string, string>; hash: string };
};
