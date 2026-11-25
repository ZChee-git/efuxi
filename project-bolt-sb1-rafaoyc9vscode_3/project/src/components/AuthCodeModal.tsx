import React, { useState } from 'react';
import { isValidAuthCode, isAuthCodeUsed, setAuthInfo } from '../utils/authUtils';

interface AuthCodeModalProps {
  onSuccess: () => void;
  onClose: () => void;
  onInfo?: () => void;
}

const AuthCodeModal: React.FC<AuthCodeModalProps> = ({ onSuccess, onClose, onInfo }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAuthCode(code)) {
      setError('授权码有误');
      return;
    }
    if (isAuthCodeUsed(code)) {
      setError('该授权码已激活过，请使用新的授权码');
      return;
    }
    setAuthInfo(code);
    setError('');
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-xs w-full text-center relative">
        {/* 右上角i按钮 */}
        {onInfo && (
          <button
            className="absolute top-2 right-2 flex items-center justify-center bg-blue-500 hover:bg-blue-700 text-white rounded-full shadow focus:outline-none"
            style={{ width: '2rem', height: '2rem', fontSize: '1.2rem', border: 'none', cursor: 'pointer', transform: 'scale(0.8)' }}
            onClick={onInfo}
            title="关于"
          >
            <span style={{fontWeight: 'bold'}}>i</span>
          </button>
        )}
        <h2 className="text-lg font-bold mb-2">输入授权码</h2>
        <form onSubmit={handleSubmit}>
          <input
            className="border rounded px-3 py-2 w-full mb-2"
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={28}
            autoFocus
          />
          {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded w-full mb-2 hover:bg-blue-700"
          >
            确认
          </button>
          <button
            type="button"
            className="text-gray-500 text-sm w-full"
            onClick={onClose}
          >
            取消
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthCodeModal;
