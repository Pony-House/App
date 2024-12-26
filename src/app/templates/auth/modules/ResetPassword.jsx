import React, { useState, useRef } from 'react';

import { Formik } from 'formik';
import PropTypes from 'prop-types';

import tinyConsole from '@src/util/libs/console';
import Checkbox from '@src/app/atoms/button/Checkbox';
import hsWellKnown from '@src/util/libs/HsWellKnown';

import {
  EMAIL_REGEX,
  BAD_EMAIL_ERROR,
  CONFIRM_PASSWORD_ERROR,
  BAD_PASSWORD_ERROR,
  PASSWORD_STRENGHT_REGEX,
} from '@src/util/register/regex';
import { isValidInput } from '@src/util/register/validator';

import * as auth from '../../../../client/action/auth';
import Input from '../../../atoms/input/Input';
import Text from '../../../atoms/text/Text';
import Button from '../../../atoms/button/Button';
import IconButton from '../../../atoms/button/IconButton';

import LoadingScreen from './LoadingScreen';
import { setLoadingPage } from '../../client/Loading';

let tempClient;
let clientSecret;
function ResetPassword() {
  const [process] = useState({});
  const [step, setStep] = useState('send');

  const [submitData, setSubmitData] = useState(null);

  const [passVisible, setPassVisible] = useState(false);
  const [cPassVisible, setCPassVisible] = useState(false);

  const [logoutDevices, setLogoutDevices] = useState(false);

  const [email, setEmail] = useState(null);

  const formRef = useRef(null);

  const baseUrl = hsWellKnown.getBaseUrl();
  const serverName = hsWellKnown.getServerName();

  const refreshWindow = () => window.location.reload();
  const initialValues = {
    password: '',
    confirmPassword: '',
    email: '',
    logoutDevices: false,
  };

  const changePassword = (values, actions) => {
    tempClient
      .setPassword(
        {
          type: 'm.login.email.identity',
          threepidCreds: { sid: submitData.sid, client_secret: clientSecret },
          threepid_creds: { sid: submitData.sid, client_secret: clientSecret },
        },
        values.password,
        logoutDevices,
      )
      .then(() => setStep('reset_complete'))
      .catch((err) => {
        tinyConsole.error(err);
        actions.setErrors({
          other: err.message,
        });
        actions.setSubmitting(false);
      });
  };

  const validator = (values) => {
    const errors = {};
    if (values.email.length > 0 && !isValidInput(values.email, EMAIL_REGEX)) {
      errors.email = BAD_EMAIL_ERROR;
    }
    if (values.password.length > 0 && !isValidInput(values.password, PASSWORD_STRENGHT_REGEX)) {
      errors.password = BAD_PASSWORD_ERROR;
    }
    if (
      values.confirmPassword.length > 0 &&
      !isValidInput(values.confirmPassword, values.password)
    ) {
      errors.confirmPassword = CONFIRM_PASSWORD_ERROR;
    }
    return errors;
  };

  const submitEmail = (values, actions) => {
    tempClient = auth.createTemporaryClient(baseUrl);
    clientSecret = tempClient.generateClientSecret();

    tempClient
      .requestPasswordEmailToken(values.email, clientSecret, 1)
      .then((data) => {
        actions.setSubmitting(true);
        setStep('waiting');
        setEmail(values.email);
        setSubmitData(data);
      })
      .catch((err) => {
        tinyConsole.error(err);
        actions.setErrors({
          other: err.message,
        });
        actions.setSubmitting(false);
      });
  };

  // const submitNumber = (phoneCountry, phoneNumber) => {

  // tempClient = auth.createTemporaryClient(baseUrl);
  // clientSecret = tempClient.generateClientSecret();

  // tempClient.requestPasswordMsisdnToken(phoneCountry, phoneNumber, clientSecret, 1);

  // };

  return (
    <>
      {step === 'send' ? (
        <>
          {process.type === 'processing' && <LoadingScreen message={process.message} />}
          <h5 className="noselect">Enter your email to reset password</h5>
          <p className="small noselect">
            <strong>{serverName}</strong> will send you a verification link to let you reset your
            password.
          </p>

          <Formik initialValues={initialValues} onSubmit={submitEmail} validate={validator}>
            {({ values, errors, handleChange, handleSubmit, isSubmitting }) => (
              <>
                {process.type === undefined && isSubmitting && (
                  <LoadingScreen className="noselect" message="Sending new password request..." />
                )}
                <form className="auth-form noselect" ref={formRef} onSubmit={handleSubmit}>
                  <div>
                    <Input
                      values={values.email}
                      name="email"
                      onChange={handleChange}
                      label="Email"
                      type="email"
                      required
                    />
                  </div>

                  {errors.email && (
                    <Text className="auth-form__error" variant="b3">
                      {errors.email}
                    </Text>
                  )}

                  <div className="auth-form__btns">
                    <Button variant="primary" type="submit" disabled={isSubmitting}>
                      Send email
                    </Button>
                  </div>
                </form>
              </>
            )}
          </Formik>
        </>
      ) : null}

      {step === 'waiting' ? (
        <center className="noselect">
          <h5>Confirm your password reset request</h5>
          <p className="small">
            {
              "Now please follow the instructions that were sent to you to continue your password reset. When you're ready, click the button below."
            }
          </p>
          <Button
            onClick={() => setStep('set_password')}
            variant="primary"
            type="submit"
            className="mb-3 me-3"
          >
            Next
          </Button>
          <Button
            onClick={() => {
              setLoadingPage('Resending password reset request');

              tempClient
                .requestPasswordEmailToken(email, clientSecret, 1)
                .then((data) => {
                  setLoadingPage(false);
                  alert('The password email was successfully resent.', 'Password Reset');
                  setSubmitData(data);
                })
                .catch((err) => {
                  setLoadingPage(false);
                  tinyConsole.error(err);
                  alert(err.message, 'Password Reset Error');
                });
            }}
            variant="secondary"
            type="submit"
            className="mb-3"
          >
            Resend email
          </Button>
        </center>
      ) : null}

      {step === 'set_password' ? (
        <>
          {process.type === 'processing' && (
            <LoadingScreen className="noselect" message={process.message} />
          )}

          <h5 className="noselect">Reseting password</h5>
          <Formik initialValues={initialValues} onSubmit={changePassword} validate={validator}>
            {({ values, errors, handleChange, handleSubmit, isSubmitting }) => (
              <>
                {process.type === undefined && isSubmitting && (
                  <LoadingScreen className="noselect" message="Sending new password..." />
                )}
                <form className="auth-form noselect" ref={formRef} onSubmit={handleSubmit}>
                  <div className="auth-form__pass-eye-wrapper">
                    <div>
                      <Input
                        values={values.password}
                        name="password"
                        onChange={handleChange}
                        label="Password"
                        type={passVisible ? 'text' : 'password'}
                        required
                      />
                    </div>
                    <IconButton
                      onClick={() => setPassVisible(!passVisible)}
                      src={passVisible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'}
                      size="extra-small"
                    />
                  </div>

                  {errors.password && (
                    <Text className="auth-form__error" variant="b3">
                      {errors.password}
                    </Text>
                  )}

                  <div className="auth-form__pass-eye-wrapper">
                    <div>
                      <Input
                        values={values.confirmPassword}
                        name="confirmPassword"
                        onChange={handleChange}
                        label="Confirm password"
                        type={cPassVisible ? 'text' : 'password'}
                        required
                      />
                    </div>
                    <IconButton
                      onClick={() => setCPassVisible(!cPassVisible)}
                      src={cPassVisible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'}
                      size="extra-small"
                    />
                  </div>

                  {errors.confirmPassword && (
                    <Text className="auth-form__error" variant="b3">
                      {errors.confirmPassword}
                    </Text>
                  )}

                  <div className="my-3 small">
                    <div className="d-inline-block me-2">
                      <Checkbox
                        className="checkbox-auth"
                        name="logoutDevices"
                        isActive={logoutDevices}
                        onToggle={setLogoutDevices}
                        variant="success"
                      />
                    </div>{' '}
                    Should all sessions be logged out after the password change.
                  </div>

                  {errors.other && (
                    <Text className="auth-form__error" variant="b3">
                      {errors.other}
                    </Text>
                  )}

                  <div className="auth-form__btns">
                    <Button variant="primary" type="submit" disabled={isSubmitting}>
                      Change password
                    </Button>
                  </div>
                </form>
              </>
            )}
          </Formik>
        </>
      ) : null}

      {step === 'reset_complete' ? (
        <center className="noselect">
          <p className="small">
            {'Your password has been changed successfully! Now you can try to log in again.'}
          </p>
          <Button onClick={() => refreshWindow()} variant="primary" type="submit" className="mb-3">
            Refresh page
          </Button>
        </center>
      ) : null}
    </>
  );
}

export default ResetPassword;
