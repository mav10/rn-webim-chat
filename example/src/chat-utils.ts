import { sha256 } from 'js-sha256';

const getHmac_sha256 = async (str: string, privateKey: string) => {
  return sha256.hmac(privateKey, str);
};

/**
 * Returns hash value for authorized user.
 * @param obj - User's json fields.
 * @param privateKey - private key value. By that hash will be generated.
 */
export const getHashForChatSign = async (
  obj: { [key: string]: string },
  privateKey: string
) => {
  const keys = Object.keys(obj).sort();
  const str = keys.map((key) => obj[key]).join('');
  return await getHmac_sha256(str, privateKey);
};
