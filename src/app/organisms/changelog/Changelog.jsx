import React, { useState, useEffect } from 'react';
import tinyConsole from '@src/util/libs/console';

import { softwareVersions } from '@src/versions';
import { fetchFn } from '@src/client/initMatrix';

import { markdown } from '@src/util/markdown';
import Spinner from '@src/app/atoms/spinner/Spinner';
import Button from '@src/app/atoms/button/Button';

import { twemojifyReact } from '../../../util/twemojify';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';

import Dialog from '../../molecules/dialog/Dialog';
import TimeFromNow from '@src/app/atoms/time/TimeFromNow';

function Changelog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [content, setContent] = useState(null);

  const version = cons.version.split('.');
  const version3Fix = version[2].split('-')[0];

  const [vp1, setVp1] = useState(null);
  const [vp2, setVp2] = useState(null);
  const [vp3, setVp3] = useState(null);
  const vp3Fix = typeof vp3 === 'string' ? vp3.split('-')[0] : null;

  const closeChangelog = () => {
    setLoading(false);
    setContent(null);
    setVp1(null);
    setVp2(null);
    setVp3(null);
  };

  const closeDialog = () => setIsOpen(false);
  const afterClose = () => {
    setIsOpen(false);
    closeChangelog();
  };

  useEffect(() => {
    const openChangelog = (v) => {
      afterClose();
      if (typeof v === 'string') {
        const openVersion = v.split('.');
        if (typeof openVersion[0] === 'string') setVp1(openVersion[0]);

        if (typeof openVersion[1] === 'string') setVp2(openVersion[1]);

        if (typeof openVersion[2] === 'string') setVp3(openVersion[2]);
      }
      setIsOpen(true);
    };

    if (vp1 && vp2 && vp3 && !content && !isLoading && isOpen) {
      if (
        softwareVersions[vp1] &&
        softwareVersions[vp1][vp2] &&
        softwareVersions[vp1][vp2][vp3Fix]
      ) {
        setLoading(true);
        fetchFn(`./changelog/${vp1}/${vp2}/${vp3Fix}.md`)
          .then((res) => res.text())
          .then((data) => {
            setLoading(false);
            setContent(data);
          })
          .catch((err) => {
            alert(err.message, 'Changelog Error');
            tinyConsole.error(err);
            setLoading(false);
            setContent('NULL');
          });
      }
    }

    navigation.on(cons.events.navigation.CHANGELOG_OPENED, openChangelog);
    return () => {
      navigation.removeListener(cons.events.navigation.CHANGELOG_OPENED, openChangelog);
    };
  });

  // Read Modal
  return (
    <Dialog
      bodyClass="bg-bg2 p-0"
      className="modal-dialog-centered modal-lg noselect modal-dialog-changelog"
      isOpen={isOpen}
      title="Changelog"
      onAfterClose={afterClose}
      onRequestClose={closeDialog}
    >
      <div className="p-4 pb-3">
        {vp1 && vp2 && vp3 ? (
          !isLoading ? (
            <>
              <h4>
                Version {vp1}.{vp2}.{version3Fix !== String(vp3) ? vp3 : version[2]}
              </h4>
              <div className="text-freedom">
                {content
                  ? twemojifyReact(markdown(content, '', '', {}).html, undefined, true, false, true)
                  : null}
              </div>

              <div className="mt-2 text-end">
                <Button
                  variant="secondary"
                  size="normal"
                  className="m-2 ms-0"
                  onClick={() => closeChangelog()}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="normal"
                  className="m-2 me-0"
                  onClick={() => closeDialog()}
                >
                  Close
                </Button>
              </div>
            </>
          ) : (
            <div className="tiny-form-align-center">
              <Spinner className="small me-3" />
              Loading data...
            </div>
          )
        ) : (
          <>
            <center>
              <h4>Versions</h4>
              {softwareVersions
                .map((vp1Items, vi1) =>
                  vp1Items
                    .map((vp2Items, vi2) =>
                      vp2Items
                        .map((vp1Items3, vi3) => {
                          if (vp1Items3) {
                            return (
                              <Button
                                key={`changelog_item_${vi1}.${vi2}.${vi3}`}
                                className="m-1 border border-bg"
                                onClick={() => {
                                  setVp1(String(vi1));
                                  setVp2(String(vi2));
                                  setVp3(String(vi3));
                                }}
                              >
                                {vi1}.{vi2}.{version3Fix !== String(vi3) ? vi3 : version[2]}
                                <br />
                                <TimeFromNow className="text-gray" timestamp={vp1Items3.date} />
                              </Button>
                            );
                          }
                        })
                        .reverse(),
                    )
                    .reverse(),
                )
                .reverse()}
            </center>

            <div className="mt-2 text-end">
              <Button
                variant="primary"
                size="normal"
                className="m-2 me-0"
                onClick={() => closeDialog()}
              >
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export default Changelog;
