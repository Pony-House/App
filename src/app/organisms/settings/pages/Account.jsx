import React, { useEffect, useRef, useState } from 'react';
import $ from 'jquery';

import { objType } from 'for-promise/utils/lib.mjs';
import tinyConsole from '@src/util/libs/console';

import userPid from '@src/util/libs/userPid';
import { registerValidator } from '@src/util/register';

import SettingTile from '@src/app/molecules/setting-tile/SettingTile';
import SettingText from '@src/app/molecules/setting-text/SettingText';
import SettingPhone from '@src/app/molecules/setting-phone/SettingPhone';

import moment, { momentFormat } from '@src/util/libs/momentjs';
import { btModal, tinyConfirm } from '@src/util/tools';

import Checkbox from '@src/app/atoms/button/Checkbox';
import Button from '@src/app/atoms/button/Button';
import IconButton from '@src/app/atoms/button/IconButton';

import SettingLoading from '@src/app/molecules/setting-loading/SettingLoading';
import { setLoadingPage } from '@src/app/templates/client/Loading';
import { openUrl } from '@src/util/message/urlProtection';

import initMatrix from '../../../../client/initMatrix';
import { parsePhoneNumber } from 'libphonenumber-js';

function AccountSection() {
  // Prepare values
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [newEmail, setNewEmail] = useState(null);

  const [newPhone, setNewPhone] = useState(null);
  const [newPhoneCountry, setNewPhoneCountry] = useState(null);

  const [logoutDevices, setLogoutDevices] = useState(false);
  const [bind] = useState(false);

  // Items list
  const [emails, setEmails] = useState(null);
  const [phones, setPhones] = useState(null);
  const [othersAuth, setOthersAuth] = useState(null);

  const submitEmail = useRef(null);
  const submitPhone = useRef(null);

  const submitNewPassword = useRef(null);
  const submitNewPassword2 = useRef(null);
  const submitPassword = useRef(null);

  // Data
  const [loadingEmails, setLoadingEmails] = useState(false);
  const mx = initMatrix.matrixClient;

  // Validator
  const accountValidation = registerValidator({
    username: mx.getUserId().split(':')[0].substring(1),
    password: newPassword,
    confirmPassword: newPassword2,
    phone: newPhone !== null ? newPhone : '',
    email: newEmail !== null ? newEmail : '',
  });

  // Read Data
  useEffect(() => {
    if (
      (__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.EMAIL_ADDRESS ||
        __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.PHONE_NUMBER ||
        __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.OTHER_AUTH_LIST) &&
      !loadingEmails &&
      emails === null
    ) {
      setLoadingEmails(true);
      userPid
        .fetch()
        .then((userEmails) => {
          const tinyEmails = [];
          const tinyPhones = [];
          const tinyOthers = [];
          for (const item in userEmails) {
            if (userEmails[item].medium === 'email') tinyEmails.push(userEmails[item]);
            else if (userEmails[item].medium === 'msisdn') tinyPhones.push(userEmails[item]);
            else tinyOthers.push(userEmails[item]);
          }

          setEmails(tinyEmails);
          setPhones(tinyPhones);
          setOthersAuth(tinyOthers);
          setLoadingEmails(false);
        })
        .catch((err) => {
          tinyConsole.error(err);
          alert(err.message, 'Get User Emails Error');
          setEmails([]);
          setLoadingEmails(false);
        });
    }
  });

  // Request a new email, phone, and more...
  const requestTokenProgress =
    (type, loadingTitle, request, value, value2, wscript, tokenVerification) => () => {
      const tinyValue = value();
      const tinyValue2 = value2();
      if (typeof tinyValue === 'string' && tinyValue.length > 0) {
        setLoadingPage(loadingTitle);
        const clientSecret = mx.generateClientSecret();
        request(tinyValue, tinyValue2, clientSecret)
          .then((result) => {
            if (objType(result, 'object')) {
              // Process data
              const fastCache = wscript();
              fastCache.where.push({
                address: tinyValue,
                added_at: new Date(),
                validated_at: null,
              });

              fastCache.setWhere(fastCache.where);
              fastCache.complete(null);
              setLoadingPage(false);

              // Prepare modal
              let tinyModal;
              const body = [
                $('<h6>').text(`The request to add a new ${type} was successfully sent!`),
              ];

              body.push(
                $('<span>', { class: 'small' }).text(
                  `Confirm the inclusion of this ${type} to prove your identity.`,
                ),
              );

              body.push($('<br>'));
              body.push($('<strong>', { class: 'very-small' }).text(`Session Id: ${result.sid}`));

              // Send modal
              tinyModal = btModal({
                title: `Adding a new ${type}`,
                id: 'new-email-progress',
                dialog: 'modal-lg modal-dialog-centered',
                body: $('<center>', { class: 'small' }).append(body),
                footer: [
                  $('<button>', { class: 'btn btn-bg mx-2' })
                    .text('Go Back')
                    .on('click', () => {
                      setCurrentPassword('');
                      tinyModal.hide();
                    }),

                  $('<button>', { class: `btn btn-primary mx-2` })
                    .text('Continue')
                    .on('click', () => {
                      // Check session
                      tinyModal.hide();
                      setLoadingPage('Checking session...');

                      // Send bindThreePid

                      const threePidAction = bind ? 'bindThreePid' : 'addThreePidOnly';
                      const threePidOptions = bind
                        ? // bindThreePid
                          {
                            client_secret: clientSecret,
                            id_access_token: initMatrix.matrixClient.getAccessToken(),
                            id_server:
                              initMatrix.matrixClient.getIdentityServerUrl(true) ||
                              initMatrix.matrixClient.baseUrl.split('://')[1],
                            sid: result.sid,
                          }
                        : // addThreePidOnly
                          {
                            sid: result.sid,
                            client_secret: clientSecret,
                          };

                      // Error
                      const sessionError = (err) => {
                        setCurrentPassword('');
                        setLoadingPage(false);
                        tinyConsole.error(err);
                        alert(err.message, 'Session Verification Error');
                      };

                      // Complete
                      const sessionComplete = () => {
                        setCurrentPassword('');
                        setLoadingPage(false);
                        alert(
                          `Your ${type} has been successfully verified!`,
                          'Session Verification',
                        );
                      };

                      // Get token validator
                      const tokenVd =
                        typeof tokenVerification === 'function' ? tokenVerification() : null;

                      // Final step
                      const tinyComplete = () =>
                        initMatrix.matrixClient[threePidAction](threePidOptions)
                          .then(sessionComplete)

                          // Error Session
                          .catch((err) => {
                            if (
                              !bind &&
                              objType(err.data, 'object') &&
                              Array.isArray(err.data.flows)
                            ) {
                              // err.data.session
                              // err.data.params

                              // Can Password
                              const canPassword = err.data.flows.find(
                                (item) =>
                                  Array.isArray(item.stages) &&
                                  item.stages[0] === 'm.login.password',
                              );

                              // Can SSO
                              const canSSO = err.data.flows.find(
                                (item) =>
                                  Array.isArray(item.stages) && item.stages[0] === 'm.login.sso',
                              );

                              // Use password
                              if (canPassword && currentPassword) {
                                threePidOptions.auth = {
                                  type: 'm.login.password',
                                  identifier: {
                                    type: 'm.id.user',
                                    user: initMatrix.matrixClient
                                      .getUserId()
                                      .split(':')[0]
                                      .substring(1),
                                  },
                                  password: currentPassword,
                                };

                                // Last try
                                initMatrix.matrixClient[threePidAction](threePidOptions)
                                  .then(sessionComplete)
                                  .catch(sessionError);
                              }

                              // Use SSO
                              /* else if (canSSO) {
                              threePidOptions.auth = {
                                type: 'm.login.token',
                                token: '',
                              };
  
                              // Last try
                              initMatrix.matrixClient[threePidAction](threePidOptions)
                                .then(sessionComplete)
                                .catch(sessionError);
                            }*/

                              // Nothing
                              else {
                                sessionError(err);
                              }
                            }

                            // Fail
                            else {
                              sessionError(err);
                            }
                          });

                      // Exist token validator
                      if (objType(tokenVd, 'object')) {
                        const tokenInput = $('<input>', {
                          class: 'form-control form-control-bg mt-2',
                          type: 'text',
                        });
                        const tokenModal = btModal({
                          title: `Adding a new ${type}`,
                          id: 'new-token-progress',
                          dialog: 'modal-lg modal-dialog-centered',
                          body: $('<center>', { class: 'small' }).append(
                            $('<center>', { class: 'small' }).text(tokenVd.message),
                            tokenInput,
                          ),
                          footer: [
                            $('<button>', { class: 'btn btn-bg mx-2' })
                              .text('Go Back')
                              .on('click', () => {
                                setCurrentPassword('');
                                tokenModal.hide();
                              }),

                            $('<button>', { class: 'btn btn-bg mx-2' })
                              .text('Continue')
                              .on('click', () => {
                                tokenVd
                                  .request(
                                    tokenInput.val(),
                                    clientSecret,
                                    result.sid,
                                    result.submit_url,
                                  )
                                  .then((result2) => tinyComplete(result2))
                                  .catch(sessionError);
                              }),
                          ],
                        });
                      }

                      // Nope. Complete!
                      else {
                        tinyComplete({ success: true });
                      }
                    }),
                ],
              });
            }
          })

          // Error
          .catch((err) => {
            setLoadingPage(false);
            tinyConsole.error(err);
            alert(err.message, 'New Account Email Error');
          });
      }
    };

  // Load emails, phones, and more...
  const loadItemsList = (where, setWhere, title, medium) =>
    Array.isArray(where) && where.length > 0 ? (
      where.map((email, index) => (
        <SettingTile
          key={`${email.address}_${index}`}
          title={<div className={`small`}>{email.address}</div>}
          options={
            <IconButton
              size="small"
              className="mx-1"
              iconColor="var(--tc-danger-normal)"
              onClick={async () => {
                const isConfirmed = await tinyConfirm(
                  `Are you sure? This decision is inreversible!\n${email.address}`,
                  `Removing ${title}`,
                );
                if (isConfirmed) {
                  setLoadingPage(`Removing ${title}...`);
                  return initMatrix.matrixClient
                    .deleteThreePid(medium, email.address)
                    .then((result) => {
                      /* if (
                        objType(result, 'object') &&
                        typeof result.id_server_unbind_result === 'string' &&
                        result.id_server_unbind_result === 'success'
                      ) { */
                      const tinyIndex = where.findIndex((item) => item.address);
                      if (tinyIndex > -1) where.splice(tinyIndex, 1);
                      alert(`Your ${title} was successfully removed.`, 'Complete!');
                      if (tinyIndex > -1) setWhere(where);
                      // } else alert(`It was not possible to remove your ${title}.`, 'Error!');
                      setLoadingPage(false);
                    })
                    .catch((err) => {
                      tinyConsole.error(err);
                      alert(err.message, 'Remove ThreePid Error');
                      setLoadingPage(false);
                    });
                }
              }}
              fa="fa-solid fa-trash-can"
              tooltip={`Remove ${title}`}
            />
          }
          content={
            <>
              {typeof email.added_at === 'number' &&
                (typeof email.validated_at !== 'number' ||
                  email.added_at !== email.validated_at) && (
                  <div className="very-small text-gray">
                    Added at
                    <span style={{ color: 'var(--tc-surface-normal)' }}>
                      {moment(email.added_at).format(
                        ` ${momentFormat.clock2()}, ${momentFormat.calendar()}`,
                      )}
                    </span>
                  </div>
                )}

              {typeof email.validated_at === 'number' && (
                <div className="very-small text-gray">
                  Validated at
                  <span style={{ color: 'var(--tc-surface-normal)' }}>
                    {moment(email.validated_at).format(
                      ` ${momentFormat.clock2()}, ${momentFormat.calendar()}`,
                    )}
                  </span>
                </div>
              )}
            </>
          }
        />
      ))
    ) : (
      <center className="very-small p-3 border-bottom border-bg"> No {title} found.</center>
    );

  const updateValue =
    (callback, refItem, err = null) =>
    (value, target, el, method) => {
      callback(value);
      if (method.isEnter && !err) {
        $(refItem.current).focus();
      }
    };

  const updatePhone =
    (refItem, err = null) =>
    (value, target, el, method) => {
      setNewPhone(value);
      setNewPhoneCountry(method.country);
      if (method.isEnter && !err) {
        $(refItem.current).focus();
      }
    };

  const dangerZoneEnabled =
    __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.DEACTIVATE_ACCOUNT ||
    __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.ERASE_ACCOUNT;

  // Complete
  return (
    <>
      <div
        className={`card noselect${__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.EMAIL_ADDRESS || __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.PHONE_NUMBER || __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.OTHER_AUTH_LIST || dangerZoneEnabled ? ' mb-3' : ''}`}
      >
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Password</li>

          <SettingTile
            title="Current password"
            content={
              <>
                <SettingText
                  placeHolder="Your password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  maxLength={100}
                  isPassword
                  content={
                    <div className="very-small text-gray">
                      Put your password here to confirm any changes you try to make in your account.
                      For safety this field will always be empty after performing an action on this
                      page.
                    </div>
                  }
                />
              </>
            }
          />

          <SettingTile
            title="Set a new account password…"
            content={
              <>
                <SettingText
                  ref={submitNewPassword}
                  placeHolder="New password"
                  value={newPassword}
                  onChange={updateValue(setNewPassword, newPassword2, accountValidation.password)}
                  maxLength={100}
                  isPassword
                />
                <SettingText
                  ref={submitNewPassword2}
                  placeHolder="Confirm the new password"
                  value={newPassword2}
                  onChange={updateValue(
                    setNewPassword2,
                    submitPassword,
                    accountValidation.confirmPassword,
                  )}
                  maxLength={100}
                  isPassword
                  content={
                    <>
                      <div className="d-flex mb-1">
                        <Checkbox isActive={logoutDevices} onToggle={setLogoutDevices} />
                        <div className="small ms-2">Disconnect all other devices.</div>
                      </div>
                      {accountValidation.password || accountValidation.confirmPassword ? (
                        <div className="very-small text-danger">
                          {!accountValidation.confirmPassword && accountValidation.password && (
                            <div className="password">
                              <i className="fa-solid fa-triangle-exclamation me-1" />
                              {accountValidation.password}
                            </div>
                          )}
                          {accountValidation.confirmPassword && (
                            <div className="confirmPassword">
                              <i className="fa-solid fa-triangle-exclamation me-1" />
                              {accountValidation.confirmPassword}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <Button
                        ref={submitPassword}
                        variant="primary"
                        disabled={
                          newPassword.length < 1 ||
                          newPassword2.length < 1 ||
                          accountValidation.password ||
                          accountValidation.confirmPassword
                            ? true
                            : false
                        }
                        onClick={() => {
                          setLoadingPage('Changing password...');
                          initMatrix.matrixClient
                            .setPassword(
                              {
                                type: 'm.login.password',
                                identifier: {
                                  type: 'm.id.user',
                                  user: initMatrix.matrixClient
                                    .getUserId()
                                    .split(':')[0]
                                    .substring(1),
                                },
                                password: currentPassword,
                              },
                              newPassword,
                              logoutDevices,
                            )
                            .then(() => {
                              setCurrentPassword('');
                              setNewPassword('');
                              setNewPassword2('');
                              setLoadingPage(false);
                              alert(`You successfully changed your password!`, 'Change Password');
                            })
                            .catch((err) => {
                              tinyConsole.error(err);
                              setNewPassword2('');
                              alert(err.message, 'Change Password Error');
                            });
                        }}
                      >
                        Change Password
                      </Button>
                    </>
                  }
                />
              </>
            }
          />
        </ul>
      </div>

      {__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.EMAIL_ADDRESS ? (
        <div
          className={`card noselect${__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.PHONE_NUMBER || __ENV_APP__.ACCOUNT_MANAGER.SUPPORT.OTHER_AUTH_LIST || dangerZoneEnabled ? ' mb-3' : ''}`}
        >
          <ul className="list-group list-group-flush">
            <li className="list-group-item very-small text-gray">Email addresses</li>

            {!loadingEmails ? (
              loadItemsList(emails, setEmails, 'email', 'email')
            ) : (
              <SettingLoading title="Loading emails..." />
            )}

            <SettingTile
              title="Add a new account email"
              content={
                <SettingText
                  placeHolder="Email address"
                  value={newEmail}
                  onChange={updateValue(setNewEmail, submitEmail, accountValidation.email)}
                  maxLength={100}
                  isEmail
                  content={
                    <>
                      {accountValidation.email ? (
                        <div className="very-small text-danger mb-1">
                          <span className="email">
                            <i className="fa-solid fa-triangle-exclamation me-1" />
                            {accountValidation.email}
                          </span>
                        </div>
                      ) : null}
                      <Button
                        ref={submitEmail}
                        variant="primary"
                        disabled={
                          typeof newEmail !== 'string' ||
                          newEmail.length < 1 ||
                          accountValidation.email
                            ? true
                            : false
                        }
                        onClick={requestTokenProgress(
                          // Text
                          'email address',
                          'Adding new email...',
                          // Send Request
                          (value, value2, secretCode) =>
                            mx.requestAdd3pidEmailToken(value, secretCode, 1),
                          // Get Value
                          () => newEmail,
                          () => null,
                          // Final Confirm
                          () => ({
                            where: emails,
                            setWhere: setEmails,
                            complete: setNewEmail,
                          }),
                        )}
                      >
                        Add Email
                      </Button>
                    </>
                  }
                />
              }
            />
          </ul>
        </div>
      ) : null}

      {__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.PHONE_NUMBER ? (
        <div
          className={`card noselect${__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.OTHER_AUTH_LIST || dangerZoneEnabled ? ' mb-3' : ''}`}
        >
          <ul className="list-group list-group-flush">
            <li className="list-group-item very-small text-gray">Phone numbers</li>

            {!loadingEmails ? (
              loadItemsList(phones, setPhones, 'phone number', 'msisdn')
            ) : (
              <SettingLoading title="Loading phone numbers..." />
            )}

            <SettingTile
              title="Add a new phone number (Beta)"
              content={
                <SettingPhone
                  placeHolder="Phone number"
                  value={newPhone}
                  onChange={updatePhone(submitPhone, accountValidation.phone)}
                  maxLength={100}
                  content={
                    <>
                      {accountValidation.phone ? (
                        <div className="very-small text-danger mb-1">
                          <span className="phone">{accountValidation.phone}</span>
                        </div>
                      ) : null}
                      <Button
                        ref={submitPhone}
                        variant="primary"
                        disabled={
                          typeof newPhone !== 'string' ||
                          newPhone.length < 1 ||
                          accountValidation.phone
                            ? true
                            : false
                        }
                        onClick={() => {
                          const phoneNumber = parsePhoneNumber(
                            newPhone,
                            newPhoneCountry !== null ? newPhoneCountry : undefined,
                          );
                          tinyConsole.log('[phone-number]', phoneNumber);
                          requestTokenProgress(
                            // Text
                            'phone number',
                            'Adding new phone...',
                            // Send Request
                            (value, value2, secretCode) =>
                              mx.requestAdd3pidMsisdnToken(value2, value, secretCode, 1),
                            // Get Value
                            () => phoneNumber.number,
                            () => phoneNumber.country,
                            // Final Confirm
                            () => ({
                              where: phones,
                              setWhere: setPhones,
                              complete: setNewPhone,
                            }),
                            // Code Validator
                            () => ({
                              message: 'Please enter the code sent to your mobile.',
                              request: (msisdnToken, secretCode, sessionId, submitUrl) =>
                                mx.submitMsisdnTokenOtherUrl(
                                  submitUrl,
                                  sessionId,
                                  secretCode,
                                  msisdnToken,
                                ),
                            }),
                          )();
                        }}
                      >
                        Add Phone
                      </Button>
                    </>
                  }
                />
              }
            />
          </ul>
        </div>
      ) : null}

      {__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.OTHER_AUTH_LIST ? (
        <div className={`card noselect${dangerZoneEnabled ? ' mb-3' : ''}`}>
          <ul className="list-group list-group-flush">
            <li className="list-group-item very-small text-gray">Other auth</li>

            {!loadingEmails ? (
              loadItemsList(othersAuth, setOthersAuth, 'auth', null)
            ) : (
              <SettingLoading title="Loading auth stuff..." />
            )}

            <SettingTile
              title="Why am I seeing that?"
              content={
                <div className="very-small text-gray">
                  The contents of this list are not compatible to be managed. This list is only
                  available for you is aware of what is running on your account.
                </div>
              }
            />
          </ul>
        </div>
      ) : null}

      {dangerZoneEnabled ? (
        <div className="card noselect">
          <ul className="list-group list-group-flush">
            <li className="list-group-item very-small text-danger">Danger zone</li>

            {__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.DEACTIVATE_ACCOUNT ? (
              <SettingTile
                title="Deactivate account"
                content={
                  <div className="very-small text-gray">
                    Deactivate your account temporarily to activate again later. Maybe you will need
                    the help of some administrator to recover your account!
                  </div>
                }
                options={
                  <Button
                    variant="danger"
                    className="d-inline-flex"
                    onClick={async () => {
                      const confirm1 = await tinyConfirm(
                        'Are you sure? That decision is inreversible!',
                        'Deactivate account',
                      );
                      if (confirm1) {
                        const confirm2 = await tinyConfirm(
                          "Are you sure? I'm serious. You'll lose everything!",
                          'Deactivate account',
                        );
                        if (confirm2) {
                          const confirm3 = await tinyConfirm(
                            "You're gonna lose everything! But if you know what you're doing, maybe you recover that account in the future. Are you sure?",
                            'Deactivate account',
                          );
                          if (confirm3) {
                            const confirm4 = await tinyConfirm(
                              "So you won't regret it? Right?",
                              'Deactivate account',
                            );
                            if (confirm4) {
                              const confirm4 = await tinyConfirm(
                                'All right! Go ahead, I will no longer try to stop you from committing any possible accident.',
                                'Deactivate account',
                              );
                              if (confirm4) {
                                mx.deactivateAccount(
                                  {
                                    type: 'm.login.password',
                                    identifier: {
                                      type: 'm.id.user',
                                      user: initMatrix.matrixClient
                                        .getUserId()
                                        .split(':')[0]
                                        .substring(1),
                                    },
                                    password: currentPassword,
                                  },
                                  false,
                                );
                              }
                            }
                          }
                        }
                      }
                    }}
                  >
                    Deactivate
                  </Button>
                }
              />
            ) : null}

            {__ENV_APP__.ACCOUNT_MANAGER.SUPPORT.ERASE_ACCOUNT ? (
              <SettingTile
                title="Erase account"
                content={
                  <div className="very-small text-gray">
                    This option will erase your account forever. Think twice before clicking here!
                  </div>
                }
                options={
                  <Button
                    variant="danger"
                    className="d-inline-flex"
                    onClick={async () => {
                      const confirm1 = await tinyConfirm(
                        'Are you sure? That decision is inreversible!',
                        'Erase account',
                      );
                      if (confirm1) {
                        const confirm2 = await tinyConfirm(
                          "Are you sure? I'm serious. You'll lose everything!",
                          'Erase account',
                        );
                        if (confirm2) {
                          const confirm3 = await tinyConfirm(
                            "You're gonna lose everything, it's all going to explode! Are you sure?",
                            'Erase account',
                          );
                          if (confirm3) {
                            const confirm4 = await tinyConfirm(
                              "So you won't regret it? Right?",
                              'Erase account',
                            );
                            if (confirm4) {
                              const confirm4 = await tinyConfirm(
                                'All right! Go ahead, I will no longer try to stop you from committing any possible accident.',
                                'Erase account',
                              );
                              if (confirm4) {
                                mx.deactivateAccount(
                                  {
                                    type: 'm.login.password',
                                    identifier: {
                                      type: 'm.id.user',
                                      user: initMatrix.matrixClient
                                        .getUserId()
                                        .split(':')[0]
                                        .substring(1),
                                    },
                                    password: currentPassword,
                                  },
                                  true,
                                );
                              }
                            }
                          }
                        }
                      }
                    }}
                  >
                    Erase
                  </Button>
                }
              />
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export default AccountSection;
