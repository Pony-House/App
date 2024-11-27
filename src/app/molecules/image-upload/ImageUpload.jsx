import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';

import initMatrix from '../../../client/initMatrix';

import Avatar from '../../atoms/avatar/Avatar';
import Spinner from '../../atoms/spinner/Spinner';
import RawIcon from '../../atoms/system-icons/RawIcon';
import FileInput, { fileInputClick, fileInputValue, uploadContent } from '../file-input/FileInput';

function ImageUpload({
  text = null,
  bgColor = 'transparent',
  imageSrc = null,
  imageAnimSrc = null,
  animParentsCount = 0,
  onUpload,
  onRequestRemove,
  className = '',
  size = 'large',
  defaultImage = null,
}) {
  const [uploadPromise, setUploadPromise] = useState(null);
  const uploadImageRef = useRef(null);

  async function uploadImage(target, getFile) {
    const file = getFile(0);
    if (file === null) return;
    try {
      const uPromise = uploadContent(file);
      setUploadPromise(uPromise);

      const res = await uPromise;
      if (typeof res?.content_uri === 'string') onUpload(res.content_uri);
      setUploadPromise(null);
    } catch {
      setUploadPromise(null);
    }
    fileInputValue(uploadImageRef, null);
  }

  function cancelUpload() {
    initMatrix.matrixClient.cancelUpload(uploadPromise);
    setUploadPromise(null);
    fileInputValue(uploadImageRef, null);
  }

  return (
    <div className={`img-upload__wrapper ${className}`}>
      <button
        type="button"
        className={`img-upload${imageSrc === null ? ' default-image' : ''}`}
        onClick={() => {
          if (uploadPromise !== null) return;
          fileInputClick(uploadImageRef, uploadImage);
        }}
      >
        <Avatar
          animParentsCount={animParentsCount}
          imgClass="profile-image-container"
          className="profile-image-container"
          imageSrc={imageSrc || defaultImage}
          imageAnimSrc={imageAnimSrc || defaultImage}
          text={text}
          bgColor={bgColor}
          size={size}
          isDefaultImage={!defaultImage}
        />
        <div
          className={`img-upload__process ${uploadPromise === null ? ' img-upload__process--stopped' : ''}`}
        >
          {uploadPromise === null &&
            (size === 'large' ? (
              <div className="very-small text-gray">
                <strong>Upload</strong>
              </div>
            ) : (
              <RawIcon fa="fa-solid fa-plus" color="white" />
            ))}
          {uploadPromise !== null && <Spinner className="small" />}
        </div>
      </button>
      {(typeof imageSrc === 'string' || uploadPromise !== null) && (
        <button
          className="img-upload__btn-cancel noselect"
          type="button"
          onClick={uploadPromise === null ? onRequestRemove : cancelUpload}
        >
          <div className="very-small text-danger">{uploadPromise ? 'Cancel' : 'Remove'}</div>
        </button>
      )}
      <FileInput onChange={uploadImage} ref={uploadImageRef} accept="image/*" />
    </div>
  );
}

ImageUpload.propTypes = {
  text: PropTypes.string,
  defaultImage: PropTypes.string,
  className: PropTypes.string,
  bgColor: PropTypes.string,
  imageSrc: PropTypes.string,
  imageAnimSrc: PropTypes.string,
  animParentsCount: PropTypes.number,
  onUpload: PropTypes.func.isRequired,
  onRequestRemove: PropTypes.func.isRequired,
  size: PropTypes.oneOf(['large', 'normal']),
};

export default ImageUpload;
